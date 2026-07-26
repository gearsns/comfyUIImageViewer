declare module '*.svg' {
  const content: string;
  export default content;
}

// CSSを文字列としてインポートする場合
declare module '*?raw' {
  const content: string;
  export default content;
}

// CSSをCSSStyleSheetオブジェクトとして扱う場合（Viteの?inline等）
declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare module "*.css" {
  const content: string;
  export default content;
}
