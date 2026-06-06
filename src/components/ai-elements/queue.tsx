import * as React from "react";

export type QueueMessage = {
  id: string;
  parts: Array<
    | { type: "text"; text: string }
    | { type: "file"; url: string; mediaType?: string; filename?: string }
  >;
};

export type QueueTodo = {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "completed";
};

type QueueSectionContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const QueueSectionContext = React.createContext<QueueSectionContextValue | null>(null);

function useQueueSectionContext() {
  const value = React.useContext(QueueSectionContext);
  if (!value) throw new Error("Queue section children must be rendered inside <QueueSection>.");
  return value;
}

export function Queue({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={`huggy-queue ${className}`} {...props}>
      {children}
    </section>
  );
}

export function QueueSection({ defaultOpen = true, className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <QueueSectionContext.Provider value={{ open, setOpen }}>
      <div className={`huggy-queue-section ${open ? "huggy-queue-section-open" : ""} ${className}`} {...props}>
        {children}
      </div>
    </QueueSectionContext.Provider>
  );
}

export function QueueSectionTrigger({ className = "", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen } = useQueueSectionContext();
  return (
    <button aria-expanded={open} className={`huggy-queue-section-trigger ${className}`} type="button" onClick={() => setOpen(current => !current)} {...props}>
      {children}
    </button>
  );
}

export function QueueSectionLabel({ label, count, className = "", ...props }: React.HTMLAttributes<HTMLSpanElement> & { label: string; count?: number }) {
  return (
    <span className={`huggy-queue-section-label ${className}`} {...props}>
      {label}{typeof count === "number" ? ` ${count}` : ""}
    </span>
  );
}

export function QueueSectionContent({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = useQueueSectionContext();
  if (!open) return null;
  return (
    <div className={`huggy-queue-section-content ${className}`} {...props}>
      {children}
    </div>
  );
}

export function QueueList({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-queue-list ${className}`} {...props}>
      {children}
    </div>
  );
}

export function QueueItem({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-queue-item ${className}`} {...props}>
      {children}
    </div>
  );
}

export function QueueItemIndicator({ completed = false, className = "", ...props }: React.HTMLAttributes<HTMLSpanElement> & { completed?: boolean }) {
  return <span className={`huggy-queue-item-indicator ${completed ? "huggy-queue-item-indicator-completed" : ""} ${className}`} aria-hidden="true" {...props} />;
}

export function QueueItemContent({ completed = false, className = "", children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { completed?: boolean }) {
  return (
    <span className={`huggy-queue-item-content ${completed ? "huggy-queue-item-content-completed" : ""} ${className}`} {...props}>
      {children}
    </span>
  );
}

export function QueueItemDescription({ completed = false, className = "", children, ...props }: React.HTMLAttributes<HTMLParagraphElement> & { completed?: boolean }) {
  return (
    <p className={`huggy-queue-item-description ${completed ? "huggy-queue-item-description-completed" : ""} ${className}`} {...props}>
      {children}
    </p>
  );
}

export function QueueItemActions({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-queue-item-actions ${className}`} {...props}>
      {children}
    </div>
  );
}

export function QueueItemAction({ className = "", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`huggy-queue-item-action ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}

export function QueueItemAttachment({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`huggy-queue-item-attachment ${className}`} {...props}>
      {children}
    </div>
  );
}

export function QueueItemImage({ className = "", alt = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img className={`huggy-queue-item-image ${className}`} alt={alt} {...props} />;
}

export function QueueItemFile({ className = "", children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`huggy-queue-item-file ${className}`} {...props}>
      {children}
    </span>
  );
}
