import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for /players/* — public player profiles live in players.$playerId.tsx,
// the player profile in players.$playerId.tsx.
export const Route = createFileRoute("/players")({
  component: () => <Outlet />,
});
