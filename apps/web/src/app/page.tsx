import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_250),_oklch(0.985_0_0)_55%)]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-16">
        <div className="space-y-3">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            EventTicketing
          </h1>
          <p className="max-w-xl text-muted-foreground">
            Discover published events and buy tickets without an account.
            Organizers manage events, staff, and door check-in from their workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button render={<Link href="/events" />}>Browse events</Button>
          <Button variant="outline" render={<Link href="/tickets/lookup" />}>
            Find my ticket
          </Button>
        </div>
      </main>
    </div>
  );
}
