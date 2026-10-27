import type { WidgetDataMap, WidgetOf, WidgetType } from '../../../shared/types'

export interface WidgetProps<K extends WidgetType> {
  widget: WidgetOf<K>
  update(patch: Partial<WidgetDataMap[K]>): void
}
