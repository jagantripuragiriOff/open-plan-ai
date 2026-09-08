/**
 * ImportBomDialog — upload a file (Excel/CSV, or a Word/PDF/text/Markdown
 * parts list), watch the background AI job parse and map it onto the BOM
 * schema, then resolve any flagged rows in a
 * chat with the AI before committing. Mirrors
 * issue-import/ImportIssuesDialog.tsx. Additive: this is a new entry point
 * alongside the existing "Import from Excel" (client-side) and "Import from
 * Google Sheets" options — neither of those change.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Paperclip, Send, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { bomImportService } from './services/bomImport.service';
import { useBomImportFlow } from './hooks/useBomImportFlow';
import { ImportProposalCard } from './components/ImportProposalCard';
import { AssistantQuestionCard } from '@/features/assistant/components/AssistantQuestionCard';
import { isSupportedImportFile, SUPPORTED_IMPORT_FILE_LABEL, type ImportProposalPreview, type CommitImportResult } from './bomImportData';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** When set, imported parts attach as sub-components of this existing node instead of at the tree root. */
  parentNodeId?: string;
}

interface PendingUserMessage {
  id: string;
  content: string;
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  optimistic?: boolean;
}

type Stage = 'upload' | 'chat' | 'result';

function toFriendlyImportError(errorSummary: string | null | undefined): string {
  if (!errorSummary) {
    return 'We couldn’t read this file. Please try another file or simplify the contents and try again.';
  }

  const normalized = errorSummary.toLowerCase();

  if (normalized.includes('no column could be matched to a part number')) {
    return 'We couldn’t find a Part Number column in this file. Try renaming a column to "Part Number" or "PN".';
  }

  if (
    normalized.includes('does not appear to contain bill of materials') ||
    normalized.includes('no parts could be found') ||
    normalized.includes("doesn't look like a parts list")
  ) {
    return 'This file doesn’t seem to contain BOM/parts data. Try a file that clearly lists parts — names, quantities, and ideally part numbers.';
  }

  if (normalized.includes('unsupported file type')) {
    return `This file type isn’t supported for BOM import. Please use ${SUPPORTED_IMPORT_FILE_LABEL}.`;
  }

  // The backend's own messages are written for the user — a missing sheet, an
  // empty file, a header row with nothing under it, etc. Show those as-is
  // rather than flattening them to a vague catch-all; only fall back to the
  // generic line for something that looks like an internal/stack error.
  const trimmed = errorSummary.trim();
  const looksInternal =
    trimmed.length > 240 ||
    /\b(error|exception|econnrefused|undefined is not|cannot read propert|stack)\b/i.test(trimmed);
  if (trimmed && !looksInternal) {
    return trimmed;
  }

  return 'We couldn’t import this file. Please try another file or edit the file so the parts list is clearer, then try again.';
}

export function ImportBomDialog({ open, onClose, projectId, parentNodeId }: Props) {
  const [stage, setStage] = useState<Stage>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingUserMessages, setPendingUserMessages] = useState<PendingUserMessage[]>([]);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const flow = useBomImportFlow(projectId, jobId);

  function reset() {
    setStage('upload');
    setJobId(null);
    setPendingFileName(null);
    setUploadError(null);
    setDraft('');
    setResult(null);
    setCommitError(null);
    setPendingUserMessages([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFiles(files: File[]) {
    const unsupported = files.filter((f) => !isSupportedImportFile(f));
    if (unsupported.length > 0) {
      setUploadError(`Unsupported file type: ${unsupported.map((f) => f.name).join(', ')}. Use ${SUPPORTED_IMPORT_FILE_LABEL}.`);
      return;
    }
    setUploadError(null);
    setPendingFileName(files.length === 1 ? files[0].name : `${files.length} files: ${files.map((f) => f.name).join(', ')}`);
    setUploading(true);
    try {
      const job = await bomImportService.startImport(projectId, files, parentNodeId);
      setJobId(job.jobId);
      setStage('chat');
    } catch (err) {
      setPendingFileName(null);
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const job = flow.job;

  useEffect(() => {
    if (job?.sourceFileName) {
      setPendingFileName(job.sourceFileName);
    }
  }, [job?.sourceFileName]);

  async function handleSend() {
    const content = draft.trim();
    if (!content) return;

    const optimisticId = `pending-${Date.now()}`;
    setPendingUserMessages((current) => [...current, { id: optimisticId, content }]);
    setDraft('');
    setSending(true);
    try {
      const sent = await flow.sendMessage(content);
      if (sent?.messageId) {
        setPendingUserMessages((current) =>
          current.map((message) => (message.id === optimisticId ? { ...message, id: sent.messageId } : message)),
        );
      }
    } catch {
      setPendingUserMessages((current) => current.filter((message) => message.id !== optimisticId));
      setDraft((current) => current || content);
    } finally {
      setSending(false);
    }
  }

  async function handleAttach(file: File) {
    setSending(true);
    try {
      await flow.uploadAttachment(file);
    } catch {
      // flow.uploadAttachment already surfaces the failure via flow.liveError.
    } finally {
      setSending(false);
    }
  }

  async function handleAnswerQuestion(answers: Array<{ header: string; selected: string[] }>) {
    const content = answers.map((a) => `${a.header}: ${a.selected.join(', ')}`).join('\n');
    setSending(true);
    try {
      await flow.sendMessage(content);
    } finally {
      setSending(false);
    }
  }

  async function handleCommit(proposalId: string) {
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await flow.commit(proposalId);
      setResult(res);
      setStage('result');
    } catch (err) {
      // A double-click hits the "no longer pending" guard, and a slow batch
      // can also blow past the request's own timeout while the backend
      // transaction keeps running — both land here even though the import
      // already succeeded or is about to. Poll status for a few seconds
      // before showing a scary error for something that actually worked.
      let latestStatus: Awaited<ReturnType<typeof bomImportService.getStatus>> | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        latestStatus = await bomImportService.getStatus(projectId, jobId!).catch(() => null);
        if (latestStatus?.status === 'completed' || latestStatus?.status === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (latestStatus?.status === 'completed') {
        setStage('result');
        setResult(null); // exact created/skipped counts aren't recoverable from status alone, but the tree already reflects the real outcome
      } else {
        setCommitError(err instanceof Error ? err.message : 'Import failed. Please try again.');
      }
    } finally {
      setCommitting(false);
    }
  }

  // The latest proposal for this conversation, whatever its current status.
  const latestProposal = flow.conversation?.proposals[0] ?? null;
  const confirmedMessages: ChatMessageItem[] = (flow.conversation?.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content ?? '',
    }));
  const confirmedUserMessageContents = new Set(
    confirmedMessages
      .filter((message) => message.role === 'user')
      .map((message) => message.content?.trim())
      .filter((content): content is string => !!content),
  );
  const optimisticMessages = pendingUserMessages
    .filter((message) => !confirmedUserMessageContents.has(message.content.trim()))
    .map((message) => ({
      id: message.id,
      role: 'user',
      content: message.content,
      createdAt: new Date().toISOString(),
      optimistic: true,
    }));
  const messages = [...confirmedMessages, ...optimisticMessages];
  const messagesSignature = messages.map((m) => `${m.id}:${'optimistic' in m && m.optimistic ? 1 : 0}`).join(',');
  const hasReviewContent = messages.length > 0 || !!latestProposal || !!flow.liveError || !!commitError;
  const hasChatStarted = messages.length > 0;
  const isProcessing = uploading || !job || !['awaiting_review', 'completed', 'failed'].includes(job.status) || !hasReviewContent;
  const isFailed = job?.status === 'failed';
  const showAssistantWorking = flow.assistantWorking && stage === 'chat' && !isProcessing && !isFailed;

  useEffect(() => {
    if (pendingUserMessages.length === 0) return;
    setPendingUserMessages((current) => current.filter((message) => !confirmedUserMessageContents.has(message.content.trim())));
  }, [confirmedUserMessageContents, pendingUserMessages.length]);

  useLayoutEffect(() => {
    if (stage !== 'chat' || isProcessing) return;
    const viewport = scrollAreaRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [stage, isProcessing, messagesSignature, latestProposal?.id, latestProposal?.status, flow.liveError, commitError, flow.pendingQuestion]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg">Import Parts with AI</DialogTitle>
          <DialogDescription className="text-sm">
            {stage === 'upload' && `Upload one or more files and AI will map them to BOM parts — ${SUPPORTED_IMPORT_FILE_LABEL}.`}
            {stage === 'chat' && !isFailed && (
              <span className="flex items-center gap-1.5 truncate">
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{pendingFileName ?? job?.sourceFileName ?? 'Preparing import…'}</span>
              </span>
            )}
            {stage === 'chat' && isFailed && 'This file couldn’t be imported'}
            {stage === 'result' && 'Import complete'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 px-6 py-5">
          {stage === 'upload' && (
            <div className="flex-1 flex flex-col gap-4">
              <div
                className={cn(
                  'flex-1 min-h-[240px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors px-6',
                  dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30',
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const files = Array.from(e.dataTransfer.files ?? []);
                  if (files.length > 0) void handleFiles(files);
                }}
              >
                <div className={cn('h-14 w-14 rounded-full flex items-center justify-center', dragging ? 'bg-primary/10' : 'bg-muted')}>
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-medium">
                    {uploading ? 'Uploading…' : (
                      <>Drop files here, or <span className="text-primary">browse</span></>
                    )}
                  </p>
                  {!uploading && (
                    <p className="text-xs text-muted-foreground">{SUPPORTED_IMPORT_FILE_LABEL}</p>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv,.docx,.pdf,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0) void handleFiles(files);
                    e.target.value = '';
                  }}
                />
              </div>
              {uploadError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Works best with a spreadsheet of Part Number, Part Name, Description, Category, and Quantity columns (add a Level column — 0, 1, 2… — for multi-level hierarchies), but a Word, PDF, or Markdown parts list works too. Non-BOM files will be rejected automatically.
              </p>
            </div>
          )}

          {stage === 'chat' && isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {uploading
                  ? `Uploading ${pendingFileName ?? 'your file'}…`
                  : `Reading ${pendingFileName ?? job?.sourceFileName ?? 'your file'}…`}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                The AI is extracting parts and preparing the review.
              </p>
            </div>
          )}

          {stage === 'chat' && isFailed && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
              <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <p className="text-sm font-medium">Couldn't import this file</p>
                <p className="text-sm text-muted-foreground">{toFriendlyImportError(job?.errorSummary)}</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" />
                Try a different file
              </Button>
            </div>
          )}

          {stage === 'chat' && !isProcessing && !isFailed && (
            <div className="flex-1 flex flex-col min-h-0 gap-4">
              <div ref={scrollAreaRef} className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1 pb-1">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'text-sm rounded-xl px-3.5 py-2.5 max-w-[85%] leading-relaxed animate-fade-in',
                      m.role === 'user' ? 'bg-primary text-primary-foreground ml-auto' : 'bg-muted',
                      'optimistic' in m && m.optimistic && 'opacity-80',
                    )}
                  >
                    {m.content}
                    {'optimistic' in m && m.optimistic && (
                      <div className="mt-1 text-[11px] opacity-70">Sending…</div>
                    )}
                  </div>
                ))}
                {flow.pendingQuestion && (
                  <div className="animate-fade-in">
                    <AssistantQuestionCard
                      questions={flow.pendingQuestion}
                      onSubmit={handleAnswerQuestion}
                      disabled={sending}
                    />
                  </div>
                )}
                {showAssistantWorking && (
                  <div className="bg-muted text-sm rounded-xl px-3.5 py-2.5 max-w-[85%] animate-fade-in">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                      </span>
                      <span>Thinking…</span>
                    </div>
                  </div>
                )}
                {(flow.liveError || commitError) && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive animate-fade-in">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{commitError ?? flow.liveError}</span>
                  </div>
                )}
              </div>

              {latestProposal && (
                <div
                  key={`${latestProposal.id}-${(latestProposal.preview as ImportProposalPreview)?.itemCount}-${(latestProposal.preview as ImportProposalPreview)?.cleanCount}-${latestProposal.status}`}
                  className="shrink-0 pt-1 animate-fade-in"
                >
                  <ImportProposalCard
                    preview={latestProposal.preview as ImportProposalPreview}
                    status={latestProposal.status}
                    result={latestProposal.result as CommitImportResult | null}
                    committing={committing}
                    compact={hasChatStarted}
                    onCommit={() => handleCommit(latestProposal.id)}
                  />
                </div>
              )}

              <div className="shrink-0 pt-4 border-t">
                <input
                  ref={attachInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.docx,.pdf,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleAttach(file);
                    e.target.value = '';
                  }}
                />
                <div className="flex items-end gap-1 rounded-2xl border border-input bg-background py-1 pl-1 pr-1.5 shadow-sm ring-offset-background transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-9 w-9 self-end rounded-full text-muted-foreground hover:text-foreground"
                    onClick={() => attachInputRef.current?.click()}
                    disabled={sending}
                    title="Attach another file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Textarea
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Ask the AI to fix a row, or explain what to change…"
                    className="min-h-9 max-h-[120px] resize-none self-center border-0 bg-transparent px-1.5 py-2 leading-[20px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="shrink-0 h-9 w-9 self-end rounded-full"
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {stage === 'result' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-medium">
                  {result ? `${result.created} part${result.created === 1 ? '' : 's'} imported` : 'Import complete'}
                </p>
                {result && result.skipped > 0 && (
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {result.skipped} row{result.skipped === 1 ? ' was' : 's were'} skipped — already in this project's BOM or still had unresolved issues.
                  </p>
                )}
              </div>
              <Button onClick={handleClose}>Done</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
