<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'

const props = defineProps({
  user: Object
})

const activeTab = ref('queue') // 'queue' or 'playlists'
const tracks = ref([])
const playlists = ref([])
const loading = ref(true)

// Playlist Creation
const playlistForm = ref({ title: '', coverFile: null })
const showPlaylistModal = ref(false) // For creating new

// Playlist Details
const selectedPlaylist = ref(null) // Detailed view
const showPlaylistDetails = ref(false)

// Editing Tracks
const editingTrack = ref(null) 
const touchStartX = ref(0)
const swipedTrackId = ref(null)

// Group tracks by User (Queue)
const groupedTracks = computed(() => {
  const groups = {}
  tracks.value.forEach(track => {
    const uid = track.userId
    if (!groups[uid]) {
      groups[uid] = { user: track.submittedBy, tracks: [] }
    }
    groups[uid].tracks.push(track)
  })
  return Object.values(groups)
})

// --- API ---

const fetchQueue = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/tracks', { headers: { 'x-admin-id': props.user.id } })
    tracks.value = res.data
  } catch (e) { console.error(e) }
  loading.value = false
}

const fetchPlaylists = async () => {
  loading.value = true
  try {
     const res = await axios.get('/api/admin/playlists', { headers: { 'x-admin-id': props.user.id } })
     playlists.value = res.data
  } catch (e) { console.error(e) }
  loading.value = false
}

const openPlaylistDetails = async (id) => {
    try {
        const res = await axios.get(`/api/admin/playlists/${id}`, { headers: { 'x-admin-id': props.user.id } })
        selectedPlaylist.value = res.data
        showPlaylistDetails.value = true
    } catch(e) { console.error(e) }
}

const savePlaylistLink = async () => {
    if (!selectedPlaylist.value) return
    try {
        await axios.put(`/api/admin/playlists/${selectedPlaylist.value.id}`, {
            serviceUrl: selectedPlaylist.value.serviceUrl
        }, { headers: { 'x-admin-id': props.user.id } })
        alert('Ссылка сохранена')
    } catch(e) { console.error(e); alert('Ошибка') }
}

// Track Logic (Swipe/Edit)
const onTouchStart = (e, id) => { touchStartX.value = e.touches[0].clientX }
const onTouchEnd = (e, id) => {
  const touchEndX = e.changedTouches[0].clientX
  if (touchStartX.value - touchEndX > 50) swipedTrackId.value = id
  else if (touchStartX.value - touchEndX < -50 && swipedTrackId.value === id) swipedTrackId.value = null
}

const startEdit = (track) => { editingTrack.value = { ...track }; swipedTrackId.value = null }
const saveEdit = async () => {
  if (!editingTrack.value) return
  try {
    await axios.put(`/api/admin/tracks/${editingTrack.value.id}`, editingTrack.value, { headers: { 'x-admin-id': props.user.id } })
    const idx = tracks.value.findIndex(t => t.id === editingTrack.value.id)
    if (idx !== -1) tracks.value[idx] = editingTrack.value
    editingTrack.value = null
  } catch (e) { console.error(e) }
}
const deleteTrack = async (id) => {
  if (!confirm('Удалить?')) return
  try {
    await axios.delete(`/api/admin/tracks/${id}`, { headers: { 'x-admin-id': props.user.id } })
    tracks.value = tracks.value.filter(t => t.id !== id)
  } catch (e) { console.error(e) }
}

// create playlist
const handleFileUpload = (e) => { playlistForm.value.coverFile = e.target.files[0] }
const createPlaylist = async () => {
  if (!playlistForm.value.title) return alert('Дайте название')
  if (!confirm('Создать плейлист из ' + tracks.value.length + ' треков?')) return
  try {
    const formData = new FormData()
    formData.append('title', playlistForm.value.title)
    if (playlistForm.value.coverFile) formData.append('cover', playlistForm.value.coverFile)
    await axios.post('/api/admin/playlists', formData, { 
        headers: { 'x-admin-id': props.user.id, 'Content-Type': 'multipart/form-data' } 
    })
    alert('Готово!')
    showPlaylistModal.value = false
    tracks.value = []
    playlistForm.value = { title: '', coverFile: null }
    activeTab.value = 'playlists'
    fetchPlaylists()
  } catch (e) { console.error(e); alert('Ошибка') }
}

onMounted(() => {
  fetchQueue()
})
</script>

<template>
  <div class="space-y-6 pb-24">
    <!-- Header with Tabs -->
    <div class="sticky top-0 bg-tg-bg/95 backdrop-blur-sm z-20 pt-4 pb-2 border-b border-gray-100 px-4">
      <div class="flex justify-between items-center mb-4">
         <h2 class="text-3xl font-bold text-tg-text">Админка</h2>
         <button v-if="activeTab==='queue' && tracks.length > 0" @click="showPlaylistModal=true" class="bg-tg-button text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md active:scale-95">
            В плейлист ({{ tracks.length }})
         </button>
      </div>
      <div class="flex space-x-4">
         <button @click="activeTab='queue'; fetchQueue()" :class="activeTab==='queue' ? 'text-tg-link border-b-2 border-tg-link' : 'text-tg-hint'" class="pb-2 font-bold flex-1">
            Очередь
         </button>
         <button @click="activeTab='playlists'; fetchPlaylists()" :class="activeTab==='playlists' ? 'text-tg-link border-b-2 border-tg-link' : 'text-tg-hint'" class="pb-2 font-bold flex-1">
            Плейлисты
         </button>
      </div>
    </div>

    <!-- QUEUE TAB -->
    <div v-if="activeTab === 'queue'" class="px-4">
       <div v-if="loading" class="text-center py-10 opacity-50">...</div>
       <div v-else-if="tracks.length === 0" class="text-center py-10 text-tg-hint bg-tg-secondary rounded-2xl">Пусто 🧹</div>
       
       <div v-else class="space-y-6">
          <div v-for="group in groupedTracks" :key="group.user?.id" class="space-y-2">
             <div class="flex items-center space-x-2 px-1">
                <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                   {{ group.user?.firstName?.[0] }}
                </div>
                <div>
                   <p class="font-bold text-tg-text leading-none">{{ group.user?.firstName }}</p>
                   <p class="text-[10px] text-tg-hint">@{{ group.user?.username }}</p>
                </div>
             </div>
             
             <!-- Track Item -->
             <div v-for="track in group.tracks" :key="track.id" class="relative overflow-hidden rounded-xl group touch-pan-y shadow-sm">
                <!-- Delete bg -->
                <div class="absolute inset-0 bg-red-500 flex items-center justify-end px-4">
                   <span class="text-white font-bold text-xs uppercase tracking-wide">Удалить</span>
                </div>
                
                <div class="bg-tg-secondary p-3 relative z-10 transition-transform duration-200"
                     :class="{'translate-x-[-80px]': swipedTrackId === track.id}"
                     @touchstart="onTouchStart($event, track.id)" @touchend="onTouchEnd($event, track.id)"
                     @click="startEdit(track)">
                   
                   <div v-if="editingTrack?.id !== track.id">
                      <div class="flex justify-between items-start">
                         <div class="flex-1 min-w-0 pr-3">
                            <p class="font-bold text-base truncate">{{ track.title }}</p>
                            <p class="text-xs text-tg-hint truncate">{{ track.artist }}</p>
                            <a :href="track.url" target="_blank" class="text-[10px] text-tg-link truncate block mt-1 opacity-70">{{ track.url }}</a>
                         </div>
                         <div class="w-1 h-8 rounded bg-gray-200 opacity-30"></div>
                      </div>
                   </div>
                   <!-- Edit Form -->
                   <div v-else class="space-y-2" @click.stop>
                      <input v-model="editingTrack.artist" class="w-full text-sm p-2 rounded-lg bg-tg-bg border-none" placeholder="Artist">
                      <input v-model="editingTrack.title" class="w-full text-sm p-2 rounded-lg bg-tg-bg border-none" placeholder="Title">
                      <input v-model="editingTrack.url" class="w-full text-xs p-2 rounded-lg bg-tg-bg border-none" placeholder="Link">
                      <div class="flex gap-2">
                         <button @click="editingTrack=null" class="flex-1 py-2 text-xs font-bold bg-gray-100 rounded-lg text-gray-500">Отмена</button>
                         <button @click="saveEdit" class="flex-1 py-2 text-xs font-bold bg-tg-button text-white rounded-lg">Сохранить</button>
                      </div>
                   </div>
                </div>
                <button v-if="swipedTrackId === track.id" @click.stop="deleteTrack(track.id)" class="absolute inset-y-0 right-0 w-[80px] z-20 opacity-0"></button>
             </div>
          </div>
       </div>
    </div>

    <!-- PLAYLISTS TAB -->
    <div v-if="activeTab === 'playlists'" class="px-4 space-y-4">
       <div v-if="playlists.length === 0" class="text-center py-10 text-tg-hint bg-tg-secondary rounded-2xl">Архив пуст</div>
       <div v-for="pl in playlists" :key="pl.id" @click="openPlaylistDetails(pl.id)" 
            class="bg-tg-secondary rounded-2xl overflow-hidden shadow-sm active:opacity-80 transition-opacity">
          <div class="aspect-video bg-gray-200 relative">
             <img v-if="pl.coverUrl" :src="pl.coverUrl" class="w-full h-full object-cover">
             <div v-else class="absolute inset-0 flex items-center justify-center text-tg-hint opacity-30 font-bold text-4xl">🎵</div>
             <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                <h3 class="text-white font-bold text-lg truncate">{{ pl.title }}</h3>
                <p class="text-white/70 text-xs">{{ pl._count?.tracks || 0 }} треков • {{ new Date(pl.createdAt).toLocaleDateString() }}</p>
             </div>
          </div>
       </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showPlaylistModal" class="fixed inset-0 bg-black/60 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
       <div class="bg-tg-bg w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4 animate-slide-up">
          <h3 class="text-xl font-bold text-center">Создать Плейлист</h3>
          <input v-model="playlistForm.title" class="w-full p-4 rounded-xl bg-tg-secondary font-bold text-lg outline-none focus:ring-2 ring-tg-link" placeholder="Название">
          <label class="block bg-tg-secondary p-4 rounded-xl text-center text-tg-hint text-sm font-medium active:opacity-60">
             <span v-if="!playlistForm.coverFile">📸 Загрузить обложку</span>
             <span v-else class="text-green-600">Обложка выбрана</span>
             <input type="file" @change="handleFileUpload" hidden accept="image/*">
          </label>
          <button @click="createPlaylist" class="w-full py-4 bg-tg-button text-white rounded-xl font-bold text-lg shadow-lg">Создать</button>
          <button @click="showPlaylistModal=false" class="w-full py-4 text-tg-hint font-medium">Отмена</button>
       </div>
    </div>

    <!-- Details Modal -->
    <div v-if="showPlaylistDetails && selectedPlaylist" class="fixed inset-0 bg-black/60 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
       <div class="bg-tg-bg w-full h-[90vh] sm:h-auto sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col animate-slide-up overflow-hidden">
          <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-tg-bg sticky top-0 z-10">
             <h3 class="font-bold text-lg truncate flex-1 pr-4">{{ selectedPlaylist.title }}</h3>
             <button @click="showPlaylistDetails=false" class="text-tg-hint text-2xl px-2">×</button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-4 space-y-6">
             <div class="aspect-video bg-gray-100 rounded-xl overflow-hidden relative shadow-inner">
                <img v-if="selectedPlaylist.coverUrl" :src="selectedPlaylist.coverUrl" class="w-full h-full object-cover">
             </div>
             
             <!-- Service Link -->
             <div class="space-y-1">
                <label class="text-xs font-bold text-tg-hint uppercase ml-1">Ссылка на сервис</label>
                <div class="flex gap-2">
                   <input v-model="selectedPlaylist.serviceUrl" placeholder="https://music.yandex.ru/..." 
                          class="flex-1 p-3 rounded-xl bg-tg-secondary text-sm border-none outline-none focus:ring-1">
                   <button @click="savePlaylistLink" class="bg-blue-600 text-white px-4 rounded-xl font-bold text-sm">Save</button>
                </div>
             </div>

             <!-- Tracks Table -->
             <div class="space-y-2">
                <label class="text-xs font-bold text-tg-hint uppercase ml-1">Треки ({{ selectedPlaylist.tracks?.length }})</label>
                <div class="bg-tg-secondary rounded-xl overflow-hidden text-sm">
                   <div v-for="(t, i) in selectedPlaylist.tracks" :key="t.id" class="p-3 border-b border-gray-100 last:border-0 flex items-center justify-between">
                      <div class="truncate pr-2">
                         <p class="font-bold truncate">{{ t.title }}</p>
                         <p class="text-xs text-tg-hint truncate">{{ t.artist }}</p>
                      </div>
                      <div class="text-right shrink-0">
                         <p class="text-[10px] bg-gray-200 px-2 py-1 rounded-full text-gray-600 font-bold">
                            {{ t.submittedBy?.firstName }}
                         </p>
                      </div>
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  </div>
</template>

<style scoped>
.animate-slide-up { animation: slideUp 0.3s ease-out; }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>
