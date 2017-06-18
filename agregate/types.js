export type DBPrimitive = string | number | boolean;
export type DBType = DBPrimitive | DBPrimitive[];
export type DBProperties = { [key: string]: DBPrimitive };

export type Query = {
  statement: string;
  parameters?: DBProperties;
}

export type CypherQuery = { toJSON: () => Query }
