// <script type="application/json"> に埋め込む JSON（"</script>" で途切れないよう < をエスケープ）
export const jsonForScript = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');
