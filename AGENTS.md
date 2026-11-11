<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Official league writes (tournaments, roles, matches, applications, structure, import) go only through SECURITY DEFINER RPCs that check permissions and write audit_log; UI hiding is cosmetic. Why: one enforced, audited path.
- Tournament images are stored as compressed data URLs in image_url because the workspace blocks public storage buckets. Why: public read without a bucket.
- Profiles are readable only through column-level SELECT grants on public fields; Discord identity columns stay ungranted and are read via get_my_discord_identity. Why: public pages need nicknames/ratings without leaking Discord IDs; new profile columns must be granted explicitly.
- Double Elimination brackets are built client-side (buildDoubleBracket) and linked in the DB via next_match_id + loser_next_match_id; propagate_match_winner moves both winner and loser. Why: one propagation path for all playoff formats.
- Home page sections live in src/routes/index.tsx + src/components/home/; division of a tournament is derived from its title via src/lib/divisions.ts. Why: no division column, avoid schema change.
