"use client";

interface ConnectionIndicatorProps {
  isConnected: boolean;
  isConnecting: boolean;
}

export function ConnectionIndicator({
  isConnected,
  isConnecting,
}: ConnectionIndicatorProps) {
  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        <span>Connected</span>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
        <span>Connecting...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
      <span>Disconnected</span>
    </div>
  );
}
