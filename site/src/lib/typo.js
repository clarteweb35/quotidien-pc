// Typographie francaise: espaces insecables, pour qu'une ligne ne commence jamais par « : », « ; », « ! », « ? », « » », « % » ou « € »,
// qu'un guillemet ouvrant ne reste pas seul en fin de ligne et que « 12 000 » ne soit pas coupe en deux.
const NB = ' ';

export function typo(texte) {
  return String(texte)
    .replace(/[ \t]+([:;!?»%€$])/g, `${NB}$1`)
    .replace(/(«)[ \t]+/g, `$1${NB}`)
    .replace(/(\d)[ \t](?=\d{3}(?!\d))/g, `$1${NB}`);
}

/** Plugin remark (sans dependance): applique typo() a tous les textes du Markdown des articles (jamais au code ni aux liens). */
export function remarkTypo() {
  const marche = (noeud) => {
    if (noeud.type === 'text') noeud.value = typo(noeud.value);
    else if (noeud.type !== 'code' && noeud.type !== 'inlineCode') for (const f of noeud.children ?? []) marche(f);
  };
  return (arbre) => marche(arbre);
}
