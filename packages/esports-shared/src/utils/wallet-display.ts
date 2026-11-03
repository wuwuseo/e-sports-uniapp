import Big from 'big.js';
import { ref } from 'vue';
import type { Ref } from 'vue';

export type WalletAccountType = 'customer_balance' | 'player_catfood';

export interface WalletDisplay {
  display_name?: string;
  icon?: string;
  description?: string;
  unit_name?: string;
  unit_cents?: number;
  display_amount?: string;
}

export type WalletDisplayMap = Record<WalletAccountType, WalletDisplay>;

// 仅缓存展示口径，绝不缓存余额或与某笔余额绑定的 display_amount。
export const WALLET_DISPLAY_TTL = 60 * 1000;

const defaults = (): WalletDisplayMap => ({
  customer_balance: {
    display_name: '余额',
    icon: 'wallet',
    description: '可用于支付订单的账户余额',
    unit_name: '元',
    unit_cents: 100,
  },
  player_catfood: {
    display_name: '猫粮',
    icon: 'cat',
    description: '陪玩已结算收入',
    unit_name: '猫粮',
    unit_cents: 100,
  },
});

export function normalizeWalletDisplay(
  value: WalletDisplayMap
): WalletDisplayMap {
  const result = defaults();
  (Object.keys(result) as WalletAccountType[]).forEach((type) => {
    const source = value?.[type];
    const target = result[type];
    (['display_name', 'icon', 'description', 'unit_name'] as const).forEach(
      (field) => {
        const text = source?.[field];
        if (typeof text === 'string' && text.trim())
          target[field] = text.trim();
      }
    );
    const unit = source?.unit_cents;
    if (typeof unit === 'number' && Number.isSafeInteger(unit) && unit > 0) {
      target.unit_cents = unit;
    }
  });
  return result;
}

export function walletUnitAmount(
  cents: number | null | undefined,
  display?: WalletDisplay | null
): string {
  const unit = display?.unit_cents;
  return new Big(cents ?? 0)
    .div(unit && unit > 0 ? unit : 100)
    .round(2, Big.roundDown)
    .toFixed(2);
}

export const walletPrimaryAmount = (
  cents: number | null | undefined,
  display?: WalletDisplay | null
) => display?.display_amount || walletUnitAmount(cents, display);

export const walletAmountText = (
  cents: number | null | undefined,
  display?: WalletDisplay | null
) => `${walletUnitAmount(cents, display)} ${display?.unit_name || '元'}`;

interface DisplayStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

interface CacheEntry {
  displays: Ref<WalletDisplayMap>;
  expiresAt: number;
  generation: number;
  pending?: Promise<WalletDisplayMap>;
}

export function createWalletDisplayCache(storage: DisplayStorage) {
  const entries = new Map<string, CacheEntry>();
  const keyOf = (scope: string) => `esports-wallet-display:v1:${scope}`;

  function entryOf(scope: string): CacheEntry {
    let entry = entries.get(scope);
    if (!entry) {
      entry = { displays: ref(defaults()), expiresAt: 0, generation: 0 };
      try {
        const saved = JSON.parse(storage.getItem(keyOf(scope)) || 'null');
        if (saved && Number.isFinite(saved.expiresAt)) {
          entry.displays.value = normalizeWalletDisplay(saved.displays);
          entry.expiresAt = saved.expiresAt;
        }
      } catch {
        // 本地存储不可用或缓存损坏时，继续使用内存缓存与服务端配置。
      }
      entries.set(scope, entry);
    }
    return entry;
  }

  function load(
    scope: string,
    loader: () => Promise<WalletDisplayMap>,
    force = false
  ): Promise<WalletDisplayMap> {
    const entry = entryOf(scope);
    if (entry.pending) return entry.pending;
    if (!force && entry.expiresAt > Date.now()) {
      return Promise.resolve(entry.displays.value);
    }
    const { generation } = entry;
    const pending = Promise.resolve()
      .then(loader)
      .then((value) => {
        if (entry.generation === generation) {
          entry.displays.value = normalizeWalletDisplay(value);
          entry.expiresAt = Date.now() + WALLET_DISPLAY_TTL;
          try {
            storage.setItem(
              keyOf(scope),
              JSON.stringify({
                displays: entry.displays.value,
                expiresAt: entry.expiresAt,
              })
            );
          } catch {
            // 存储失败不影响配置生效，也不缓存任何金额。
          }
        }
        return entry.displays.value;
      })
      .catch(() => entry.displays.value)
      .finally(() => {
        if (entry.pending === pending) entry.pending = undefined;
      });
    entry.pending = pending;
    return pending;
  }

  function remember(
    scope: string,
    type: WalletAccountType,
    display?: WalletDisplay
  ) {
    if (!display) return;
    const entry = entryOf(scope);
    entry.generation += 1;
    entry.pending = undefined;
    entry.displays.value = normalizeWalletDisplay({
      ...entry.displays.value,
      [type]: display,
    });
  }

  function clear(scope: string) {
    const entry = entryOf(scope);
    entry.expiresAt = 0;
    entry.generation += 1;
    entry.pending = undefined;
    try {
      storage.removeItem(keyOf(scope));
    } catch {
      // 缓存失效仍在内存中立即生效。
    }
  }

  return {
    state: (scope: string) => entryOf(scope).displays,
    load,
    remember,
    clear,
  };
}
