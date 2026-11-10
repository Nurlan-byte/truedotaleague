import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for /players/* — the list lives in players.index.tsx,
// the player profile in players.$playerId.tsx.
export const Route = createFileRoute("/players")({
  component: () => <Outlet />,
});
