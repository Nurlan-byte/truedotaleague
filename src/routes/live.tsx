import { createFileRoute, redirect } from "@tanstack/react-router";

// Старый адрес «Турнир онлайн» — теперь всё в каталоге турниров.
export const Route = createFileRoute("/live")({
  beforeLoad: () => {
    throw redirect({ to: "/tournaments", statusCode: 301 });
  },
});
