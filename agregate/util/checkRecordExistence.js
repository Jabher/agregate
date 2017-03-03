export default function checkRecordExistence(node) {
    if (!node.__isReflected)        {throw new Error('cannot perform action for non-reflected record')}
}
