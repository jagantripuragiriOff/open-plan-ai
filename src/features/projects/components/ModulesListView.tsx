import { Module, Task } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatModuleType, getModuleColor } from '../utils/projectUtils';
import { resolveFileUrl } from '@/utils/fileUrl';

interface ModuleWithStats extends Module {
  taskCount: number;
  progress: number;
  openIssues: number;
  tasks: Task[];
}

interface ModulesListViewProps {
  modules: ModuleWithStats[];
  onModuleClick?: (module: ModuleWithStats) => void;
}

export function ModulesListView({ modules, onModuleClick }: ModulesListViewProps) {
  if (modules.length === 0) {
    return (
      <div className="rounded-lg border bg-card min-h-[calc(100vh-260px)] flex flex-col items-center justify-center p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <ListTodo className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium mb-1 text-base">No modules yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Add modules to organize your project by functional areas
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40 border-b border-border">
          <TableRow className="bg-background hover:bg-background">
            <TableHead className="w-[250px] bg-background font-semibold text-foreground">Module</TableHead>
            <TableHead className="bg-background font-semibold text-foreground">Type</TableHead>
            <TableHead className="bg-background font-semibold text-foreground">Owner</TableHead>
            <TableHead className="text-center bg-background font-semibold text-foreground">Tasks</TableHead>
            <TableHead className="w-[180px] bg-background font-semibold text-foreground">Progress</TableHead>
            <TableHead className="text-center bg-background font-semibold text-foreground">Issues</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {modules.map((module) => {
            const moduleColor = getModuleColor(module.type);
            const isComplete = module.progress === 100;

            return (
              <TableRow
                key={module.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onModuleClick?.(module)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: moduleColor }}
                    />
                    <div className="min-w-0 max-w-[160px] sm:max-w-[220px] md:max-w-xs">
                      <p className="font-medium truncate">{module.name}</p>
                      {module.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {module.description}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {formatModuleType(module.type)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {module.owner ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={resolveFileUrl(module.owner.avatar) ?? module.owner.avatar} alt={module.owner.name} />
                        <AvatarFallback className="text-[10px]">
                          {module.owner.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{module.owner.name}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-sm font-medium">{module.taskCount}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={module.progress} className="h-2 flex-1" />
                    <span className="text-sm font-medium w-10 text-right">
                      {Math.round(module.progress)}%
                    </span>
                    {isComplete && (
                      <CheckCircle2 className="h-4 w-4 text-status-done" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {module.openIssues > 0 ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {module.openIssues}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
