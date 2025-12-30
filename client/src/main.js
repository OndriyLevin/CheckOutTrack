import axios from 'axios'

// Set base URL for API requests to work under the subpath
axios.defaults.baseURL = '/music'

createApp(App).mount('#app')
