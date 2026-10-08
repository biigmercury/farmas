import { Button, Card } from "@/components/ui";

/** Shown while a page's data is loading. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-6" >
      <div className="h-24 animate-pulse rounded-2xl bg-forest/10" />
      <div className="h-24 animate-pulse rounded-2xl bg-forest/10" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Shown when a page could not load. Plain message and a way to try again. */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="!p-6">
      <p role="alert" className="font-bold text-critical">
        {message}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      )}
    </Card>
  );
}
