export type DBPrimitive = string | number | boolean;
export type DBType = DBPrimitive | DBPrimitive[];

export type Query = {
    statement: string;
    parameters?: {[key:string]: DBType};
}

export type QueryBuilder = {
    toJSON: () => Query;
}