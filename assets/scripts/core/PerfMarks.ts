// 上线前必做（260613-prelaunch-must-do）阶段2：启动加载耗时埋点（AC-502）。
// 由 Constants.PERF_TRACE_ENABLED 控制是否记录/输出；线上发布前关闭。

interface PerfMarksApi {
  mark(name: string): void;
  measure(from: string, to: string): number | null;
  report(): Record<string, number>;
  dump(): void;
  reset(): void;
}

const marks: Record<string, number> = {};

export const PerfMarks: PerfMarksApi = {
  mark(name: string): void {
    marks[name] = performance.now();
  },

  measure(from: string, to: string): number | null {
    const a = marks[from];
    const b = marks[to];
    if (a === undefined || b === undefined) return null;
    return Math.round(b - a);
  },

  /** 按记录顺序返回相邻 mark 的耗时（ms），key 形如 "app_start→wx_cloud_init_done"。 */
  report(): Record<string, number> {
    const names = Object.keys(marks);
    const result: Record<string, number> = {};
    for (let i = 1; i < names.length; i++) {
      const from = names[i - 1];
      const to = names[i];
      result[`${from}→${to}`] = Math.round(marks[to] - marks[from]);
    }
    const first = names[0];
    const last = names[names.length - 1];
    if (first && last && first !== last) {
      result[`${first}→${last} (total)`] = Math.round(marks[last] - marks[first]);
    }
    return result;
  },

  dump(): void {
    const report = this.report();
    if (Object.keys(report).length === 0) {
      console.log('[PerfMarks] no marks recorded');
      return;
    }
    console.table(report);
  },

  reset(): void {
    for (const key of Object.keys(marks)) delete marks[key];
  },
};
