/**
 * 日期工具：全项目唯一日期来源。
 *
 * 约定：所有「今天 / lastUpdateDate / 印章」一律用本地时区日期（YYYY-MM-DD）。
 * ⚠️ 不要用 `new Date().toISOString().slice(0, 10)`——那是 UTC 日期，GMT+8 用户
 * 每天本地 00:00–08:00 期间会比本地日期「晚一天」，会导致每日换句/轮询判断错乱。
 */
export function localDateString(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** 本地日期短格式 MM/DD（印章用），与 localDateString 同源 */
export function localMonthDay(): string {
  return localDateString().slice(5).replace('-', '/');
}
