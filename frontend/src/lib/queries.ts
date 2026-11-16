import { useQuery } from "@tanstack/react-query";

import { get, qs, type Paginated } from "./api";
import type { Property, Unit } from "./types";

export function useProperties(search?: string) {
  return useQuery({
    queryKey: ["properties", search ?? ""],
    queryFn: () => get<Paginated<Property>>(`/api/properties/${qs({ search, page_size: 200 })}`),
  });
}

export function useUnits(property?: number | string) {
  return useQuery({
    queryKey: ["units", property ?? "all"],
    queryFn: () => get<Paginated<Unit>>(`/api/units/${qs({ property, page_size: 200 })}`),
  });
}
