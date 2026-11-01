// qrcode 官方包不带类型声明。
// 这里只声明项目用到的浏览器端 toDataURL（H5 收银台渲染二维码），
// 避免引入 @types/qrcode 间接依赖 @types/node@26（其语法超出项目 TypeScript 4.9 的解析范围）。
declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    margin?: number;
    width?: number;
    errorCorrectionLevel?: 'low' | 'medium' | 'quartile' | 'high' | 'L' | 'M' | 'Q' | 'H';
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  };

  export default QRCode;
}
