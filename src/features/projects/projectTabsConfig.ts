import type { LucideIcon } from 'lucide-react';
import { Layers, GitMerge, ListTodo, Boxes, Flag, AlertTriangle, ListChecks } from 'lucide-react';
import type { ProjectTabConfig, ProjectTabId } from '@/types';

export interface ProjectTabDefinition {
  id: ProjectTabId;
  label: string;
  title: string;
  icon: LucideIcon;
}

export const PROJECT_TAB_DEFINITIONS: Record<ProjectTabId, ProjectTabDefinition> = {
  bom: { id: 'bom', label: 'BOM', title: 'Bill of Materials', icon: Layers },
  requirements: { id: 'requirements', label: 'Requirements', title: 'Requirements', icon: ListChecks },
  'eng-changes': { id: 'eng-changes', label: 'Eng. Changes', title: 'Engineering Changes', icon: GitMerge },
  tasks: { id: 'tasks', label: 'Tasks', title: 'Tasks', icon: ListTodo },
  modules: { id: 'modules', label: 'Modules', title: 'Modules', icon: Boxes },
  milestones: { id: 'milestones', label: 'Milestones', title: 'Milestones', icon: Flag },
  issues: { id: 'issues', label: 'Issues', title: 'Issues', icon: AlertTriangle },
};

export const DEFAULT_PROJECT_TAB_ORDER: ProjectTabId[] = [
  'requirements',
  'bom',
  'eng-changes',
  'tasks',
  'modules',
  'milestones',
  'issues',
];

export const DEFAULT_PROJECT_TAB_CONFIG: ProjectTabConfig[] = DEFAULT_PROJECT_TAB_ORDER.map((id, index) => ({
  id,
  visible: true,
  order: index,
}));

/**
 * Merges a project's saved tab config with the default tab set, so tab ids that
 * predate a project's saved config (or are added to the product later) still
 * show up in a stable order instead of disappearing.
 */
export function resolveProjectTabConfig(saved?: ProjectTabConfig[] | null): ProjectTabConfig[] {
  if (!saved || saved.length === 0) return DEFAULT_PROJECT_TAB_CONFIG;

  const savedById = new Map(saved.map((t) => [t.id, t]));
  return DEFAULT_PROJECT_TAB_ORDER.map(
    (id, index) => savedById.get(id) ?? { id, visible: true, order: index }
  ).sort((a, b) => a.order - b.order);
}

export function visibleOrderedTabDefinitions(config: ProjectTabConfig[]): ProjectTabDefinition[] {
  return config
    .filter((t) => t.visible)
    .sort((a, b) => a.order - b.order)
    .map((t) => PROJECT_TAB_DEFINITIONS[t.id]);
}
