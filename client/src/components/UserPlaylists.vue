<template>
  <div class="space-y-6">
    <h2 class="text-xl font-bold text-white flex items-center gap-2">
      <span class="w-2 h-6 bg-brand-yellow rounded-full inline-block"></span>
      Плейлисты
    </h2>

    <div v-if="loading" class="text-center py-10">
      <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-yellow mx-auto"></div>
    </div>

    <div v-else-if="playlists.length === 0" class="text-center text-gray-500 py-10">
      Пока нет плейлистов
    </div>

    <div v-else class="grid gap-4">
      <div 
        v-for="playlist in playlists" 
        :key="playlist.id"
        @click="$emit('select', playlist.id)"
        class="bg-brand-gray/40 backdrop-blur-md rounded-2xl overflow-hidden border border-white/5 active:scale-[0.98] transition-all cursor-pointer hover:border-brand-yellow/30 group"
      >
        <div class="flex h-24">
          <!-- Cover -->
          <div class="w-24 shrink-0 bg-black relative">
             <img v-if="playlist.coverUrl" :src="playlist.coverUrl" class="absolute inset-0 w-full h-full object-cover" alt="Playlist Cover" />
             <div v-else class="absolute inset-0 flex items-center justify-center text-4xl bg-brand-dark/50">🎵</div>
          </div>
          
          <!-- Content -->
          <div class="p-4 flex flex-col justify-center flex-1 min-w-0">
             <h3 class="text-white font-bold text-lg truncate group-hover:text-brand-yellow transition-colors">{{ playlist.title }}</h3>
             <p class="text-gray-400 text-xs mt-1">{{ playlist._count.tracks }} треков</p>
             <p class="text-gray-500 text-[10px] mt-2 font-mono uppercase tracking-widest">
                {{ new Date(playlist.createdAt).toLocaleDateString() }}
             </p>
          </div>

          <!-- Arrow -->
          <div class="flex items-center justify-center px-4 text-gray-500 group-hover:text-white transition-colors">
             <span class="text-2xl">›</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const playlists = ref([])
const loading = ref(true)

const fetchPlaylists = async () => {
    try {
        const res = await axios.get('/api/playlists')
        playlists.value = res.data
    } catch (e) {
        console.error(e)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    fetchPlaylists()
})
</script>
