import { useEffect, useState, type CSSProperties } from 'react'
import type { SystemStats } from '../../../shared/types'
import { useActive, useInterval } from '../context'
import { Icon } from '../icons'
import type { WidgetProps } from './types'

interface BatteryInfo {
  level: number
  charging: boolean
}

/** Battery Status API de Chromium; en equipos sin batería no se muestra. */
function useBattery(): BatteryInfo | null {
  const [info, setInfo] = useState<BatteryInfo | null>(null)
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<any> }
    if (!nav.getBattery) return
    let battery: any
    const read = (): void => {
      // Un sobremesa suele dar 100 % «cargando» con tiempo 0: se trata como sin batería.
      const desktop = battery.charging && battery.level === 1 && battery.chargingTime === 0
      setInfo(desktop ? null : { level: battery.level, charging: battery.charging })
    }
    nav.getBattery().then((b) => {
      battery = b
      read()
      b.addEventListener('levelchange', read)
      b.addEventListener('chargingchange', read)
    })
    return () => {
      battery?.removeEventListener('levelchange', read)
      battery?.removeEventListener('chargingchange', read)
    }
  }, [])
  return info
}

const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1).replace('.', ',')

function Meter({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: 'gauge' | 'database' | 'battery' }): JSX.Element {
  const level = value >= 85 ? 'high' : value >= 60 ? 'mid' : 'low'
  return (
    <div className="meter">
      <div className="meter-head">
        <Icon name={icon} size={13} />
        <span className="grow">{label}</span>
        <span className="mono meter-value">{Math.round(value)} %</span>
      </div>
      <div className={`meter-bar ${level}`} role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ '--v': `${Math.min(100, value)}%` } as CSSProperties} />
      </div>
      <span className="meter-detail">{detail}</span>
    </div>
  )
}

export function SystemWidget({ widget }: WidgetProps<'system'>): JSX.Element {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const battery = useBattery()
  const { show } = widget.data
  // Cada 2 s mientras se ve; oculto, no consulta nada.
  useInterval(() => {
    window.nido.system.stats().then((r) => r.ok && setStats(r.data))
  }, 2000, useActive())

  if (!stats) return <div className="empty-state compact muted">Leyendo el sistema…</div>
  return (
    <div className="system">
      {show.cpu && <Meter label="CPU" icon="gauge" value={stats.cpu} detail={`${stats.cores} núcleos`} />}
      {show.memory && (
        <Meter label="Memoria" icon="database" value={(stats.memUsed / stats.memTotal) * 100} detail={`${gb(stats.memUsed)} de ${gb(stats.memTotal)} GB`} />
      )}
      {show.battery && battery && (
        <Meter label="Batería" icon="battery" value={battery.level * 100} detail={battery.charging ? 'Cargando' : 'Con batería'} />
      )}
    </div>
  )
}
