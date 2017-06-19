//@flow
import { Var, Cypher } from "./cypher"

export type DBPrimitive = string | number | boolean
export type DBType = DBPrimitive | DBPrimitive[]
export type DBProperties = { [key: string]: DBPrimitive }

export type Query = {
  statement: string,
  parameters?: DBProperties
}

export type CypherQuery = { toJSON: () => Query }

export interface IEntity {
  isRelation?: boolean,

  __selfQuery(selfVar: Var): Cypher,

  __namedSelfQuery(entity: Var): Cypher,
  __namedSelfQuery(entity: Var, other: ?Var): Cypher,

  __namedTailQuery(entity: Var): Cypher,
  __namedTailQuery(entity: Var, other: ?Var): Cypher,

  __namedHeadQuery(entity: Var): Cypher,
  __namedHeadQuery(entity: Var, other: ?Var): Cypher
}

export interface IRelation extends IEntity {
  __namedRelQuery(rel: Var): Cypher
}

export interface IRecord extends IEntity {}

export type primitive = void | string | number | boolean

export type LookupQuery = {
  $gt?: number,
  $gte?: number,
  $lt?: number,
  $lte?: number,
  $exists?: boolean,
  $startsWith?: string,
  $endsWith?: string,
  $contains?: string,
  $has?: primitive,
  $in?: primitive[]
}

export type IParamsQuery = {
  [string]: primitive | primitive[] | LookupQuery
}

export type IRelationsQuery = IRelation

export type AdvancedQuery =
  | IParamsQuery
  | IParamsQuery[]
  /*note: by this syntax (not ?:) we're declaring that empty object will be threated as IParamsQuery */
  | {|
      $params: IParamsQuery | IParamsQuery[],
      $relations: IRelationsQuery | IRelationsQuery[]
    |}
  | {| $params: IParamsQuery | IParamsQuery[] |}
  | {| $relations: IRelationsQuery | IRelationsQuery[] |}
  | IRelationsQuery
  | IRelationsQuery[]
