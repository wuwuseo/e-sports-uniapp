// 弹窗 Promise 化：uni.showModal 是回调风格，各页面自己包 Promise 时容易漏掉 fail 分支，
// 一旦弹窗失败 await 就永久挂起（页面卡在 loading）。这里统一兜底：
// 取消与失败都按「未确认」返回，调用方只需判断 confirm。

export interface PromptResult {
  /** 是否点了确定。 */
  confirm: boolean;
  /** 输入内容（已 trim；未确认时为空串）。 */
  text: string;
}

/** 可编辑确认框：返回是否确认与输入内容。 */
export function promptModal(
  title: string,
  placeholder = '',
  content = ''
): Promise<PromptResult> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      editable: true,
      placeholderText: placeholder,
      success: (res) =>
        resolve({ confirm: !!res.confirm, text: (res.content || '').trim() }),
      fail: () => resolve({ confirm: false, text: '' }),
    });
  });
}

/** 普通确认框：只返回是否确认。 */
export function confirmModal(
  title: string,
  content: string,
  confirmText = '确定'
): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      confirmText,
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
}
