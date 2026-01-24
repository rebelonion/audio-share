import { BrowserRouter, Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Home from './pages/Home'
import About from './pages/About'
import Contact from './pages/Contact'
import Stats from './pages/Stats'
import Browse from './pages/Browse'
import Share from './pages/Share'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/browse/*" element={<Browse />} />
          <Route path="/share/:source/*" element={<Share />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
