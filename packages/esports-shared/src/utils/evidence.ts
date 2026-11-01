// 售后凭证选择与上传：uni.chooseImage / uni.chooseMessageFile 逐张上传，返回附件 ID 列表。

import { uploadAttachment } from '../api/upload';

/** 售后凭证目录（服务端约定）。 */
const EVIDENCE_DIRECTORY = 'private/esports/aftersale';

/** 单张上传器：客服端需换成 admin 通道，否则 uploaded_by 域不符会被归属校验拒绝。 */
export type EvidenceUploader = (filePath: string) => Promise<number>;

/** 默认上传器：前台用户通道（uploaded_by = user:<uid>）。 */
const userEvidenceUploader: EvidenceUploader = (filePath) =>
  uploadAttachment(filePath, EVIDENCE_DIRECTORY);

function normalizePaths(paths: string | string[]): string[] {
  return Array.isArray(paths) ? paths : [paths];
}

/** 逐张上传，返回成功上传的附件 ID（单张失败仅跳过，不中断）。 */
async function uploadAll(paths: string[], uploader: EvidenceUploader): Promise<number[]> {
  const ids: number[] = [];
  for (const path of paths) {
    try {
      ids.push(await uploader(path));
    } catch {
      // 上传层已 toast，跳过失败项。
    }
  }
  return ids;
}

/** 从聊天记录选择文件（含文档，小程序端支持）。 */
function chooseMessageFiles(): Promise<string[]> {
  return new Promise((resolve) => {
    const chooser = (
      uni as unknown as {
        chooseMessageFile?: (options: {
          count: number;
          type: 'all';
          success: (res: { tempFiles: Array<{ path: string }> }) => void;
          fail: () => void;
        }) => void;
      }
    ).chooseMessageFile;
    if (!chooser) {
      uni.showToast({ title: '当前环境不支持选择文档', icon: 'none' });
      resolve([]);
      return;
    }
    chooser({
      count: 9,
      type: 'all',
      success: (res) => resolve((res.tempFiles || []).map((f) => f.path)),
      fail: () => resolve([]),
    });
  });
}

/**
 * 弹出选择方式（图片 / 文档），选择后逐张上传，返回附件 ID 列表。
 * 用户取消或未选择时返回空数组。
 * @param uploader 单张上传器；客服代建售后须传 admin 通道上传器（uploadCsAttachment）。
 */
export function pickEvidenceAttachments(
  uploader: EvidenceUploader = userEvidenceUploader
): Promise<number[]> {
  return new Promise((resolve) => {
    uni.showActionSheet({
      itemList: ['从相册选择图片', '从聊天记录选择文件'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          uni.chooseImage({
            count: 9,
            sizeType: ['compressed'],
            success: async (chooseRes) => {
              resolve(await uploadAll(normalizePaths(chooseRes.tempFilePaths), uploader));
            },
            fail: () => resolve([]),
          });
        } else {
          resolve(await uploadAll(await chooseMessageFiles(), uploader));
        }
      },
      fail: () => resolve([]),
    });
  });
}
