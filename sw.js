self.addEventListener("install", (e) => {
    e.waitUntil(
        (async () => {
            const cache = await caches.open("cache")
            await cache.addAll([])
        })()
    )
})

self.addEventListener("fetch", (e) => {
    const cachePromise = caches.open("cache").then(res => {
        return res
    })
    const cachedResPromise = cachePromise
        .then(cache => cache.match(e.request))
        .then(cachedRes => {
            if(cachedRes) {
                return cachedRes
            }else{
                throw "No cached resource"
            }
        })
    const networkResPromise = fetch(e.request)
    Promise.all([cachePromise, networkResPromise]).then(([cache, res]) => {
        if(res.ok){
            cache.put(e.request, res.clone())
        }
    }).catch(_ => _)
    e.respondWith(Promise.any([cachedResPromise, networkResPromise]))
})