declare module "roundrobin" {
  export default function roundRobin<T>(count: number, players: T[]): [T, T][][];
}
