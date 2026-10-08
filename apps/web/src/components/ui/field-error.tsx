import * as React from "react"
import { cn } from "cn"

function FieldError({
  className,
  message,
  ...props
}: Omit<React.ComponentProps<"p">, "children"> & { message?: string }) {
  if (!message) return null

  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn("text-xs text-destructive", className)}
      {...props}
    >
      {message}
    </p>
  )
}

export { FieldError }
