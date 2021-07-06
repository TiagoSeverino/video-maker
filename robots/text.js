const sentenceBoundaryDetection = require('sbd')

const watsonApiKey = require('../credentials/watson-nlu.json').apikey
const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1');
const { IamAuthenticator } = require('ibm-watson/auth');

const superAgent =  require('superagent');
const readline = require('readline-sync');
const unidecode = require('unidecode');

const state = require('./state.js')

async function robot() {
  console.log('> [text-robot] Starting...')
  const content = state.load()

  const nlu = new NaturalLanguageUnderstandingV1({
    authenticator: new IamAuthenticator({ apikey: watsonApiKey }),
    version: '2018-04-05',
    serviceUrl: 'https://api.eu-de.natural-language-understanding.watson.cloud.ibm.com/instances/454a16df-6dfd-40cc-bcf0-1f9e82dacdc8',
    language: content.lang
  });

  await fetchContentFromWikipedia(content)
  sanitizeContent(content)
  breakContentIntoSentences(content)
  limitMaximumSentences(content)
  await fetchKeywordsOfAllSentences(content)

  state.save(content)

  async function fetchContentFromWikipedia(content) {
    console.log('> [text-robot] Fetching content from Wikipedia')
    
    const images = [];
    var ctn = '';
    var title = '';
    var summary =''
    var pageid = '';
    var url = '';
    const links = [];
    const references = [];


    console.log('Fetching from Wikipedia...')
    var RealText = await getRealText(content.searchTerm)
    title = RealText;
    console.log('Searching content...')
    await getContent();
    
    
    content.sourceContentOriginal = ctn
    console.log('> [text-robot] Fetching done!')

    //console.log('Building Structure to others Robots...')
    //return await buildStructure();
    
    /*
    *
    * Tenta buscar o termo na Wikipedia, se o mesmo não for encontrado ele encerra o programa,
    * Caso encontre mais de um,o mesmo sugere e pergunta qual termo você realmente tem interesse baseado na busca no Wikipedia.
    * 
    * Obs: Um fato interessante é que o mesmo caso mude a URL da wikipedia para https://pt.wiki... o mesmo vai retornar sua busca em Português Brasil
    */
    async function getRealText(text){
        const res = await superAgent.get('https://en.wikipedia.org/w/api.php').query({
            'action':'opensearch',
            'search':''+text,
            'limit':5,
            'namespace':0,
            'format':"json"
        })
        if(res.body[1].length == 0){
            console.log('Your search term don\'t return any result')
            console.log('Tip: Search your therm in English or pre-search valid Words')
            console.log('Exiting Program...')
            process.exit()
        }
        let sugestions = []
        res.body[1].forEach(e => {
            sugestions.push(unidecode(e))
        });
        let index = await selectTerm(sugestions)
        if(index == -1){
            console.log('You don\'t selected any key')
            console.log('Exiting Program...')
            process.exit()
        }
        url = res.body[3][index]
        return res.body[1][index]
    }
    async function selectTerm(prefix){
        return readline.keyInSelect(prefix,'Choose if any of these keys is the desired search :')
    }
    /*
    *
    * Busca Todas as Informações da Pagina da Wikipedia Conforme a API do Algotithmia, trazendo ate alguns dados a mais, sendo que no momento, não estamos utilizando.
    * 
    */
    async function getContent(){
        const ret = await superAgent.get('https://en.wikipedia.org/w/api.php').query({
            'action':'query',
            'prop': 'extracts|images|links|info|extlinks',
            'redirects': 1,
            'exsectionformat':'wiki',
            'explaintext':true,
            'titles':RealText,
            'format':"json"
        })
        let value
        map = new Map(Object.entries(ret.body.query.pages));
        map.forEach(function(e){
            value = e;
        });
        try{
            value.links.forEach(e => {
                links.push(e.title)
            });
        }catch(Ex){
            console.log('----------------------------')
            console.log('Any Links in this search')
            console.log('----------------------------')
        }
        try{
            value.extlinks.forEach(e => {
                references.push(e['*'])
            });
        }catch(Ex){
            console.log('----------------------------')
            console.log('Any Reference in this search')
            console.log('----------------------------')
        }
        pageid = value.pageid;
        ctn = value.extract;
        summary =  value.extract.split('\n\n\n')[0]
        console.log("Fetching Images...")
        for (let i = 0; i < value.images.length; i++) {
            await getURLImage(value.images[i].title);
        }
        
    }
    /*
    *
    * Busca a URL das imagens retornadas anteriormente no metodo getContent(), podendo ser utilizada futuramente em outros robos.
    * 
    */
    async function getURLImage(title){
        const ret = await superAgent.get('https://en.wikipedia.org/w/api.php').query({
            'action':'query',
            'prop': 'imageinfo',
            'titles':title,
            'format':"json",
            'iiprop':'url'
        })
        values = [];
        map = new Map(Object.entries(ret.body.query.pages));
        map.forEach(function(e){
            e.imageinfo.forEach(function(e){
              values.push(e.url)
            });
        });
        values.forEach(function(e){
          images.push(e);
        }); 
    }
    /*
    *
    * Constroi uma estrutura de dados, igual a do Algorithmia.
    * 
    */
    async function buildStructure(){
        return {
            content: ctn,
            images:  images,
            links: links,
            pageid:pageid,
            references:references,
            summary: summary,
            title: title,
            url: url
        }
        
    }
  }

  function sanitizeContent(content) {
    const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(content.sourceContentOriginal)
    const withoutDatesInParentheses = removeDatesInParentheses(withoutBlankLinesAndMarkdown)

    content.sourceContentSanitized = withoutDatesInParentheses

    function removeBlankLinesAndMarkdown(text) {
      const allLines = text.split('\n')

      const withoutBlankLinesAndMarkdown = allLines.filter((line) => {
        if (line.trim().length === 0 || line.trim().startsWith('=')) {
          return false
        }

        return true
      })

      return withoutBlankLinesAndMarkdown.join(' ')
    }
  }

  function removeDatesInParentheses(text) {
    return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/  /g,' ')
  }

  function breakContentIntoSentences(content) {
    content.sentences = []

    const sentences = sentenceBoundaryDetection.sentences(content.sourceContentSanitized)
    sentences.forEach((sentence) => {
      content.sentences.push({
        text: sentence,
        keywords: [],
        images: []
      })
    })
  }

  function limitMaximumSentences(content) {
    content.sentences = content.sentences.slice(0, content.maximumSentences)
  }

  async function fetchKeywordsOfAllSentences(content) {
    console.log('> [text-robot] Starting to fetch keywords from Watson')

    for (const sentence of content.sentences) {
      
      try {
        console.log(`> [text-robot] Sentence: "${sentence.text}"`)

        sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text)

        console.log(`> [text-robot] Keywords: ${sentence.keywords.join(', ')}\n`)
      }
      catch {
        console.log(`> [text-robot] Failed to process keywords\n`)
      }
    }
  }

  async function fetchWatsonAndReturnKeywords(sentence) {
    return new Promise((resolve, reject) => {
      nlu.analyze({
        text: sentence,
        features: {
          keywords: {}
        }
      }).then(response => {
        const keywords = response.result.keywords.map((keyword) => {
          return keyword.text
        })

        resolve(keywords)
      }).catch(err => {
        reject(err)
      });
    })
  }
}

module.exports = robot
