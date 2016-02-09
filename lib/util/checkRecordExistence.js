export default function checkRecordExistence(node) {
    if (!node.uuid)
        throw new Error(`cannot perform action for non-reflected record`)
}
