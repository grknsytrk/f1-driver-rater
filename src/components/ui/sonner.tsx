import {
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  Flag,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className="toaster group"
      icons={{
        success: <Flag className="size-4 text-[#00FF88]" />,
        info: <InfoIcon className="size-4 text-[var(--accent-yellow)]" />,
        warning: <TriangleAlertIcon className="size-4 text-[var(--accent-orange)]" />,
        error: <OctagonXIcon className="size-4 text-[var(--accent-red)]" />,
        loading: <Loader2Icon className="size-4 animate-spin text-[var(--accent-red)]" />,
      }}
      toastOptions={{
        style: {
          background: "var(--bg-panel)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
          fontFamily: "'Formula1', 'Titillium Web', sans-serif",
          fontSize: "12px",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        },
        classNames: {
          title: "font-display text-sm tracking-wider",
          description: "text-[var(--text-secondary)] text-xs normal-case",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
