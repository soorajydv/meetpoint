self.addEventListener('install', (event) => { self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Notification', body: 'New update' }
  const title = data.title || 'Aptly'
  const options = { body: data.body || '', icon: '/aptly-push-icon.png' }
  event.waitUntil(self.registration.showNotification(title, options))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const hadWindow = clientsArr.some((client) => { if ('focus' in client) { client.focus(); return true } return false })
      if (!hadWindow && self.clients.openWindow) return self.clients.openWindow('/')
    })
  )
})
