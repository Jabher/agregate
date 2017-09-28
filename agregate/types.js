// @flow

export type DBPrimitive = string | number | boolean;
export type DBProperties = { [key: string]: DBPrimitive };

export type Query = {
  statement: string,
  parameters?: DBProperties
};

export type CypherQuery = { toJSON: () => Query };

export type QueryBuilder = CypherQuery
