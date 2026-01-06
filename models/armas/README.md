# Pasta de Armas / Weapons Folder

Esta pasta contém os modelos 3D de armas para o jogo Canaa Strike.

## Armas Disponíveis

### 🔫 Assault Rifle
- **Arquivo:** `Assault Rifle.glb`
- **Tipo:** Fuzil de Assalto
- **Uso:** Arma principal do jogador
- **Dano:** 35 por tiro
- **Cadência:** ~10 tiros/segundo
- **Munição:** 30 balas

---

## Como Adicionar Novas Armas

### 1. Baixar Modelo
1. Acesse [poly.pizza](https://poly.pizza) ou [Sketchfab](https://sketchfab.com)
2. Procure por "weapon", "gun", "rifle", "pistol", etc.
3. Baixe em formato **GLB** (preferível) ou **GLTF**
4. **IMPORTANTE:** Escolha modelos **low-poly** (menos de 5k polígonos) para melhor performance mobile

### 2. Adicionar ao Projeto
1. Coloque o arquivo `.glb` nesta pasta (`models/armas/`)
2. Nomeie claramente (ex: `SMG.glb`, `Sniper.glb`, `Shotgun.glb`)

### 3. Integrar no Código
Edite `components/GameContainer.tsx` no componente `Player`:

```typescript
// Exemplo: carregar nova arma
const WeaponModel: React.FC<{ weaponType: string }> = ({ weaponType }) => {
  const weaponUrl = `/models/armas/${weaponType}.glb`;
  try {
    const { scene } = useGLTF(weaponUrl);
    return <Primitive object={scene} scale={0.8} />;
  } catch (e) {
    // Fallback se modelo não existir
    return <DefaultWeaponMesh />;
  }
};
```

---

## Recomendações de Modelos

### Fuzis / Rifles
- ✅ Assault Rifle (AK-47, M4A1 style) - **já incluído**
- 📥 Sniper Rifle (AWP, Barrett style)
- 📥 Battle Rifle (SCAR, FAL style)

### SMGs (Submetralhadoras)
- 📥 MP5
- 📥 UZI
- 📥 Vector

### Pistolas
- 📥 Desert Eagle
- 📥 Glock
- 📥 Revolver

### Shotguns
- 📥 Pump Shotgun
- 📥 Auto Shotgun

### Especiais
- 📥 RPG
- 📥 Grenade Launcher

---

## Otimização para Mobile

### Diretrizes de Performance
- **Polígonos:** Máximo 5.000 polys por arma
- **Texturas:** Máximo 512x512px (1024x1024 para armas premium)
- **Formato:** GLB (comprimido) ao invés de GLTF
- **LOD:** Considere modelos simplificados para distância

### Teste de Performance
Após adicionar nova arma:
1. Teste em dispositivo mobile real (se possível)
2. Use DevTools → Performance para verificar FPS
3. Remova se FPS cair abaixo de 30

---

## Estrutura de Dados

```javascript
// Exemplo de configuração de arma
const weaponConfig = {
  name: "Assault Rifle",
  model: "Assault Rifle.glb",
  damage: 35,
  fireRate: 0.1, // segundos entre tiros
  ammo: 30,
  reloadTime: 2.5,
  recoil: 0.008,
};
```

---

## Links Úteis
- [poly.pizza - Modelos Low Poly](https://poly.pizza)
- [Sketchfab - Filtro Downloadable](https://sketchfab.com/search?features=downloadable&type=models&q=weapon)
- [Three.js GLTF Loader Docs](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)

---

**Última Atualização:** Janeiro 2026  
**Armas Totais:** 1
