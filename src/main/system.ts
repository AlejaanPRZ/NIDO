import os from 'node:os'
import { IPC, type SystemStats } from '../shared/types'
import { handleResult } from './errors'

// CPU y memoria con el módulo os de Node (sin procesos externos). El uso de
// CPU se calcula por diferencia entre dos lecturas; la batería la lee el
// renderer con la Battery Status API.

let previous = os.cpus().map((c) => c.times)

function stats(): SystemStats {
  const current = os.cpus().map((c) => c.times)
  let idle = 0
  let total = 0
  current.forEach((t, i) => {
    const p = previous[i] ?? t
    const sum = (x: os.CpuInfo['times']): number => x.user + x.nice + x.sys + x.idle + x.irq
    idle += t.idle - p.idle
    total += sum(t) - sum(p)
  })
  previous = current
  return {
    cpu: total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0,
    cores: current.length,
    memUsed: os.totalmem() - os.freemem(),
    memTotal: os.totalmem(),
    uptime: os.uptime()
  }
}

export function registerSystem(): void {
  handleResult(IPC.system.stats, () => stats())
}
