import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftPublished } from "@/components/DraftPublished";

const { useDraftPublication } = vi.hoisted(() => ({ useDraftPublication: vi.fn() }));
vi.mock("@/hooks/use-draft-publication", () => ({
  useDraftPublication: () => useDraftPublication(),
}));

describe("public draft view", () => {
  beforeEach(() => useDraftPublication.mockReset());

  it("shows a published roster without leader controls", () => {
    useDraftPublication.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        updated_at: "2026-10-18T12:00:00Z",
        result: {
          title: "Test Night",
          teams: [
            { name: "Blue", captain: "Alex", players: [{ name: "Player One", nick: "P1" }] },
            { name: "Red", captain: "Bora", players: [] },
          ],
        },
      },
    });
    const html = renderToStaticMarkup(<DraftPublished />);
    expect(html).toContain("Test Night");
    expect(html).toContain("Player One");
    expect(html).not.toContain("Опубликовать результат");
    expect(html).not.toContain("Добавить капитана");
  });

  it("explains the empty public state", () => {
    useDraftPublication.mockReturnValue({ isPending: false, isError: false, data: null });
    expect(renderToStaticMarkup(<DraftPublished />)).toContain("пока не опубликовал");
  });
});
