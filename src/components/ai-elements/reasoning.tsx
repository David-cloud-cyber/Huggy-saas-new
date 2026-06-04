import * as React from "react";

type ReasoningContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isStreaming: boolean;
};

const ReasoningContext = React.createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
  const value = React.useContext(ReasoningContext);
  if (!value) throw new Error("Reasoning components must be rendered inside <Reasoning>.");
  return value;
}

export function Reasoning({
  isStreaming = false,
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { isStreaming?: boolean }) {
  const [open, setOpen] = React.useState(isStreaming);

  React.useEffect(() => {
    setOpen(isStreaming);
  }, [isStreaming]);

  return (
    <ReasoningContext.Provider value={{ open, setOpen, isStreaming }}>
      <section
        aria-busy={isStreaming}
        className={`huggy-reasoning ${isStreaming ? "huggy-reasoning-streaming" : ""} ${className}`}
        {...props}
      >
        {children}
      </section>
    </ReasoningContext.Provider>
  );
}

export function ReasoningTrigger({
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen, isStreaming } = useReasoningContext();

  return (
    <button
      aria-expanded={open}
      className={`huggy-reasoning-trigger ${className}`}
      type="button"
      onClick={() => setOpen(current => !current)}
      {...props}
    >
      <span className="huggy-reasoning-dot" aria-hidden="true" />
      <span>{children || (isStreaming ? "Huggy is thinking" : "Agent notes")}</span>
      <span aria-hidden="true">{open ? "-" : "+"}</span>
    </button>
  );
}

export function ReasoningContent({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = useReasoningContext();

  if (!open) return null;

  return (
    <div className={`huggy-reasoning-content ${className}`} {...props}>
      {children}
    </div>
  );
}
