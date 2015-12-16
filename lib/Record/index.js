import uuid from 'uuid'
import {MetaClass} from '../util/MetaClass'
import {checkRecordExistence, getRecordLabelMap, createParamsString, createNodeQuery} from '../util/index'
import Converter from '../Converter'
import {Cypher} from '../Cypher/index'

export class Record extends MetaClass {
    static register = Converter.registerRecordClass

    /** @private */
    static __createQuery( params ) { return createNodeQuery( this.label, params )}

    static async byUuid( uuid ) {
        if ( uuid === undefined )
            throw new Error( 'trying to query by undefined uuid' )

        return (await this.where({ uuid }))[ 0 ]
    }

    static async where( params, { offset, limit, order } = {}) {
        if ( order && !Array.isArray( order ) ) order = [ order ]

        return (await this.connection.query( Cypher.tag`
        MATCH (entry:${this.__createQuery( params )})
        RETURN entry
        ${Cypher.raw( order ? `ORDER BY ${order.map( orderEntity => `entry.${orderEntity}` ).join( ',' )}` : `` )}
        ${Cypher.raw( offset ? `SKIP ${offset}` : `` )}
        ${Cypher.raw( limit ? `LIMIT ${limit}` : `` )}
        ` ))
            .map( result => result.entry )
            .map( Converter.nodeToRecord )
    }

    static get label() {return this.name}

    __createSelfQuery() {
        checkRecordExistence( this, `${this.label}#__createSelfQuery` )
        return this.__createQuery({ uuid: this.uuid })
    }

    /** @private */
    __createQuery( params ) { return createNodeQuery( this.label, params ) }

    getRelation( relationName ) {
        checkRecordExistence( this, `${this.label}#getRelation` )
        return new Relation( this, relationName )
    }

    get connection() { return this.constructor.connection }

    get uuid() { return this.metadata.node.properties.uuid }

    get label() {return this.constructor.label}

    constructor( opts = {}, metadata = {}) {
        super()
        Object.assign( this, opts )
        Object.assign( this.metadata, metadata )
    }

    async __create() {
        const [ { entry } ] = await this.connection.query( Cypher.tag`
        CREATE (entry:${Cypher.raw( this.label )})
        SET entry += ${{ ...this }},
            entry.created_at = timestamp(),
            entry.updated_at = timestamp(),
            entry.uuid = ${uuid.v4()}
        RETURN entry` )
        this.metadata.node = entry
        Object.assign( this, entry.properties )
    }

    async __update() {
        const [ { entry } ] = await this.connection.query( Cypher.tag`
        MATCH (entry:${this.__createSelfQuery()})
        SET entry += ${{ ...this }},
            entry.updated_at = timestamp()
        RETURN entry` )
        this.metadata.node = entry
        Object.assign( this, entry.properties )
    }

    async save( opts = {}) {
        Object.assign( this, opts )
        await (this.metadata.node ? this.__update() : this.__create())
        return this
    }

    async destroy() {
        checkRecordExistence( this, `${this.label}#destroy` )
        await this.connection.query( Cypher.tag`
        MATCH (entry:${this.__createSelfQuery()})
        DELETE entry` )
        this.metadata.destroyed = true
        return this
    }
}

class Relation extends MetaClass {
    constructor( source, label ) {
        super()
        this.metadata = { source, label }
    }

    get connection() { return this.metadata.source.connection }

    async size() {
        const { source, label } = this.metadata
        const response = await this.connection.query( Cypher.tag`
        MATCH (source:${source.__createSelfQuery()})
        MATCH (source)-[relation:${Cypher.raw( label )}]-()
        RETURN count(relation)` )
        return response[ 0 ][ 'count(relation)' ]
    }

    async add( ...records ) {
        const { source, label } = this.metadata
        for ( let record of records )
            checkRecordExistence( record, `${this.label}#add` )
        return Promise.all( getRecordLabelMap( records )
            .map( ([ recordLabel, records ]) =>
                this.connection.query( Cypher.tag`
                MATCH (source:${source.__createSelfQuery()})
                MATCH (target:${Cypher.raw( recordLabel )})
                    WHERE target.uuid IN ${records.map( record => record.uuid )}
                MERGE (source)-[:${Cypher.raw( label )}]-(target)` ) ) )
    }

    async clear() {
        const { source, label } = this.metadata
        await this.connection.query( Cypher.tag`
            MATCH (:${source.__createSelfQuery()})-[relation:${Cypher.raw( label )}]-()
            DELETE relation` )
    }

    //noinspection ReservedWordAsName - relation is trying to re-use Set API
    async delete( ...records ) {
        const { source, label } = this.metadata
        for ( let record of records )
            checkRecordExistence( record )
        await Promise.all( getRecordLabelMap( records )
            .map( ([ recordLabel, records ]) =>
                this.connection.query( Cypher.tag`
                    MATCH (source:${source.__createSelfQuery()})
                    MATCH (target:${Cypher.raw( recordLabel )})
                    MATCH (source)-[relation:${Cypher.raw( label )}]-(target)
                        WHERE target.uuid IN ${records.map( record => record.uuid )}
                    DELETE relation` ) ) )
    }

    async entries( props = {}, type = null ) {
        const { source, label } = this.metadata
        const response = await this.connection.query( Cypher.tag`
            MATCH (source:${source.__createSelfQuery()})
            MATCH (target${Cypher.raw( type ? `:${type}` : '' )} ${Cypher.literal( props )})
            MATCH (source)-[:${Cypher.raw( label )}]-(target)
            RETURN target` )
        return response.map( ({ target }) => Converter.nodeToRecord( target ) )
    }
}
