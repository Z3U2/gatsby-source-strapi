const { createRemoteFileNode } = require(`gatsby-source-filesystem`)

/**
 * Tests if field is an object
 *
 *
 * @param {any} field - Field to test
 * @returns {boolean} - True if `field` is an object, False if null or not an object
 */
const isObject = field => {
  if (field === null) {
    return false
  }
  return typeof field === 'object'
}

const extractFields = async (
  apiURL,
  store,
  cache,
  createNode,
  createNodeId,
  touchNode,
  auth,
  item
) => {
  for (const key of Object.keys(item)) {
    const field = item[key]
    // image fields have a mime property among other
    // maybe should find a better test
    if (field !== null && field.hasOwnProperty('mime')) {
      let fileNodeID
      // using field on the cache key for multiple image field
      const mediaDataCacheKey = `strapi-media-${item.id}-${key}`
      const cacheMediaData = await cache.get(mediaDataCacheKey)

      // If we have cached media data and it wasn't modified, reuse
      // previously created file node to not try to redownload
      if (cacheMediaData && field.updatedAt === cacheMediaData.updatedAt) {
        fileNodeID = cacheMediaData.fileNodeID
        touchNode({ nodeId: cacheMediaData.fileNodeID })
      }

      // If we don't have cached data, download the file
      if (!fileNodeID) {
        try {
          // full media url
          const source_url = apiURL + field.url
          const fileNode = await createRemoteFileNode({
            url: source_url,
            store,
            cache,
            createNode,
            createNodeId,
            auth,
          })

          // If we don't have cached data, download the file
          if (fileNode) {
            fileNodeID = fileNode.id

            await cache.set(mediaDataCacheKey, {
              fileNodeID,
              updatedAt: field.updatedAt,
            })
          }
        } catch (e) {
          // Ignore
        }
      }
      if (fileNodeID) {
        item[`${key}___NODE`] = fileNodeID
      }
    } else if (Array.isArray(field)) {
      // add recursion to fetch nested strapi references (array)
      await Promise.all(
        field.map(async f =>
          extractFields(
            apiURL,
            store,
            cache,
            createNode,
            createNodeId,
            touchNode,
            auth,
            f
          )
        )
      )
    } else if (isObject(field)) {
      // add recursion to fetch nested strapi references (single reference)
      await extractFields(
        apiURL,
        store,
        cache,
        createNode,
        createNodeId,
        touchNode,
        auth,
        field
      )
    }
  }
}

// Downloads media from image type fields
exports.downloadMediaFiles = async ({
  entities,
  apiURL,
  store,
  cache,
  createNode,
  createNodeId,
  touchNode,
  jwtToken: auth,
}) =>
  Promise.all(
    entities.map(async entity => {
      for (let item of entity) {
        // loop item over fields
        await extractFields(
          apiURL,
          store,
          cache,
          createNode,
          createNodeId,
          touchNode,
          auth,
          item
        )
      }
      return entity
    })
  )
