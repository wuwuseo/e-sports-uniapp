// 附件上传：uni.uploadFile 原生 multipart/form-data 上传（支持 filePath + formData）。
// 与 request.ts 的 JSON 请求层区分开，供陪玩服务截图等场景使用。

import { API_BASE, getToken } from './request';

interface ApiEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

interface AttachmentObject {
  id: number;
  [key: string]: unknown;
}

/**
 * 上传附件，成功返回附件 ID（data.id）。
 * @param filePath 本地文件路径（uni.chooseImage 返回的 tempFilePaths 元素）
 * @param directory 附件目录（服务截图用 private/esports/service-evidence）
 */
export function uploadAttachment(filePath: string, directory: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    uni.uploadFile({
      url: `${API_BASE}/api/v1/auth/attachments/upload`,
      filePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${getToken()}`,
      },
      formData: { directory },
      success: (res) => {
        let body: ApiEnvelope<AttachmentObject> | undefined;
        try {
          body = JSON.parse(res.data) as ApiEnvelope<AttachmentObject>;
        } catch {
          uni.showToast({ title: '上传响应解析失败', icon: 'none' });
          reject(new Error('上传响应解析失败'));
          return;
        }
        if (
          res.statusCode < 200 ||
          res.statusCode >= 300 ||
          !body ||
          body.code !== 1 ||
          !body.data?.id
        ) {
          const message = body?.message || `上传失败（${res.statusCode}）`;
          uni.showToast({ title: message, icon: 'none' });
          reject(new Error(message));
          return;
        }
        resolve(body.data.id);
      },
      fail: (err) => {
        const message = err.errMsg || '上传失败，请稍后重试';
        uni.showToast({ title: message, icon: 'none' });
        reject(new Error(message));
      },
    });
  });
}
