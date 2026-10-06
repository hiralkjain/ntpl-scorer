export type Tournament={id:string;name:string;format:string;overs_per_innings:number;registered_players_per_team:number;playing_players_per_team:number;qualification_count:number;status:string};
export type Team={id:string;tournament_id:string;name:string;short_name:string;logo_url:string|null};
export type Match = {
  id: string;
  tournament_id: string;
  match_number: number;
  round_number: number | null;
  match_type: "league" | "final";
  team_a_id: string | null;
  team_b_id: string | null;
  turf: string | null;
  status: string;
  scheduled_at: string | null;
  winner_team_id: string | null;
  result_type?: "win" | "tie" | "no_result" | "abandoned" | null;
};