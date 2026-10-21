import { useGSAP } from '@gsap/react'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import gsap from 'gsap'
import { BookOpen, Dices, Handshake, Swords } from 'lucide-react'
import { useRef } from 'react'
import { ArcanaCard } from '#/components/ArcanaCard'
import { Button } from '#/components/ui/button'
import { meQuery } from '#/lib/queries'

export const Route = createFileRoute('/')({ component: Landing })

const HERO_CARDS = ['escudo_misericordia', 'caridad_lucifer', 'dadofon']

function Landing() {
  const { data: me } = useQuery(meQuery)
  const root = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from('.hero-line', { y: 36, opacity: 0, duration: 0.9, stagger: 0.12 })
        .from('.hero-card', { y: 120, rotation: (i) => (i - 1) * 25, opacity: 0, duration: 1, stagger: 0.14 }, '-=0.6')
        .from('.feature', { y: 24, opacity: 0, duration: 0.6, stagger: 0.1 }, '-=0.4')
      gsap.to('.hero-card', { y: '-=10', duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.4, from: 'center' } })
    },
    { scope: root },
  )
  return (
    <div ref={root}>
      <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="hero-line font-display text-xs uppercase tracking-[0.5em] text-infernal">Arcana et Chaos</p>
          <h1 className="hero-line gold-text mt-3 text-5xl font-black leading-[1.05] sm:text-7xl">
            Chiffre <span className="text-parch">&amp;</span> Chaos
          </h1>
          <p className="hero-line mt-6 max-w-xl text-xl leading-relaxed text-parch-dim">
            En el Códice Cifrado, un libro prohibido custodiado por ángeles y demonios, cada fragmento está protegido por una pregunta. Los cónclaves
            compiten por descifrarlo… pero el saber no basta: <em className="text-parch">se gana sabiendo la materia, se sobrevive leyendo a los demás equipos.</em>
          </p>
          <div className="hero-line mt-8 flex flex-wrap gap-3">
            <Link to={me ? '/lobby' : '/auth'}><Button size="lg">{me ? 'Entrar a una sala' : 'Comenzar'}</Button></Link>
            <Link to="/grimorio"><Button size="lg" variant="ghost"><BookOpen size={18} />Ver los 40 Arcanos</Button></Link>
          </div>
        </div>
        <div className="relative flex min-h-[420px] items-center justify-center">
          {HERO_CARDS.map((k, i) => (
            <div key={k} className="hero-card absolute" style={{ transform: `translateX(${(i - 1) * 120}px) rotate(${(i - 1) * 9}deg)`, zIndex: i === 1 ? 2 : 1 }}>
              <ArcanaCard cardKey={k} size="lg" />
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { i: Swords, t: 'Líderes y fichas', d: 'Sólo los líderes juegan. Cada uno guarda 3 fichas —sus integrantes— que pueden ser intercambiadas, robadas, prestadas o desterradas por los Arcanos.' },
          { i: Dices, t: 'Azar criptográfico', d: 'Los dados del cónclave se tiran con un generador criptográficamente seguro (CSPRNG). Ni el destino admite semillas predecibles.' },
          { i: Handshake, t: 'Diplomacia con precio', d: 'Susurra pactos a otros equipos… pero conversar cuesta 1 punto. Elige a quién le vendes tu confianza.' },
        ].map(({ i: I, t, d }) => (
          <div key={t} className="feature panel rune-border p-6">
            <I className="text-gold" size={26} />
            <h3 className="mt-3 text-lg font-bold text-parch">{t}</h3>
            <p className="mt-2 text-parch-dim">{d}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
