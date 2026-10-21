import { Shield, Users } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { orderTeamMembers } from "@/lib/team-members";

export type TeamListItem = {
  id: string;
  name: string;
  tag: string;
  logo_url: string | null;
  owner_id: string;
  team_members: {
    id: string;
    profile_id: string | null;
    position: number;
    nickname: string;
    mmr: number | null;
  }[];
};

export function TeamList({
  teams,
  defaultValue = [],
}: {
  teams: TeamListItem[];
  defaultValue?: string[];
}) {
  return (
    <Accordion
      type="multiple"
      defaultValue={defaultValue}
      className="space-y-3"
      aria-label="Список команд"
    >
      {teams.map((team) => {
        const members = orderTeamMembers(team.team_members);
        const triggerId = `team-trigger-${team.id}`;
        const rosterId = `team-roster-${team.id}`;
        return (
          <AccordionItem
            key={team.id}
            value={team.id}
            className="panel min-w-0 overflow-hidden border-b"
          >
            <AccordionTrigger
              id={triggerId}
              aria-controls={rosterId}
              className="min-w-0 gap-3 px-4 py-4 hover:bg-white/30 hover:no-underline sm:px-5"
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <TeamLogo name={team.name} logo={team.logo_url ?? undefined} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-base font-bold text-foreground [overflow-wrap:anywhere] sm:text-lg">
                    {team.name}
                  </span>
                  {team.tag && (
                    <span className="block break-all text-xs font-semibold uppercase tracking-wide text-primary">
                      [{team.tag}]
                    </span>
                  )}
                </span>
                <span
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
                  aria-label={`Игроков: ${members.length}`}
                >
                  <Users aria-hidden="true" className="size-3.5" />
                  {members.length}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent
              id={rosterId}
              aria-labelledby={triggerId}
              className="border-t border-border px-4 pb-4 pt-3 sm:px-5"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Состав команды
              </p>
              {members.length ? (
                <ol className="space-y-2">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/55 px-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1 break-words font-medium [overflow-wrap:anywhere]">
                        {member.nickname}
                      </span>
                      {member.profile_id === team.owner_id && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          <Shield aria-hidden="true" className="size-3" /> Капитан
                        </span>
                      )}
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {member.mmr === null
                          ? "MMR не указан"
                          : `${member.mmr.toLocaleString("ru-RU")} MMR`}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Состав ещё не указан.</p>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
