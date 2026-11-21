/**
 * 同步 tabBar 未读徽标：0 移除，超过 99 显示 99+。
 * index 必须与各端 pages.json 的 tabBar 顺序一致，改动页签顺序时同步调整调用方常量。
 */
export function syncTabBadge(index: number, value: number) {
  if (value > 0) {
    uni.setTabBarBadge({
      index,
      text: value > 99 ? '99+' : `${value}`,
      fail: () => {},
    });
    return;
  }
  uni.removeTabBarBadge({ index, fail: () => {} });
}

export default syncTabBadge;
