import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Toast góc màn hình, tự ẩn sau 3 giây
const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="light"
    position="bottom-right"
    duration={3000}
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4 text-[var(--better)]" />,
      info: <InfoIcon className="size-4 text-primary" />,
      warning: <TriangleAlertIcon className="size-4 text-[#b45309]" />,
      error: <OctagonXIcon className="size-4 text-destructive" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    style={
      {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "12px",
      } as React.CSSProperties
    }
    {...props}
  />
)

export { Toaster }
