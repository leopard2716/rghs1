import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  size = "default"
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "default" | "wide" | "large";
}) {
  const sizeClass =
    size === "large" ? " modal-panel-large" : size === "wide" ? " modal-panel-wide" : "";

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className={`modal-panel${sizeClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h3>{title}</h3>
          <button className="icon-button" type="button" aria-label="Close modal" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
