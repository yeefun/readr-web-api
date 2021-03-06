const Cookies = require('cookies')
const config = require('../../config')
const debug = require('debug')('READR-API:api:points:donate')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')
const { API_PROTOCOL, API_HOST, API_PORT, API_TIMEOUT, POINT_OBJECT_TYPE, } = require('../../config')
const { genInvoice, } = require('../invoice')
const { get, } = require('lodash')
const { handlerError, } = require('../../comm')
const isEmail = require('validator/lib/isEmail')
const { default: isMobilePhone } = require('validator/lib/isMobilePhone')
const corsMiddle = require('../corsMiddle')

const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

const validateObjectType = (req, res, next) => {
  try {
    const objectType = get(req, 'body.object_type')
    debug('objectType: ', objectType)
    if (objectType === POINT_OBJECT_TYPE.DONATE) {
      next()
    } else {
      res.status(403).end('Invalid object type')
    }
  } catch (e) {
    console.error(e)
  }
}

const validateDonator = (req, res, next) => {
  try {
    const payload = get(req, 'body', {})
    const memberName = get(payload, 'member_name', '')
    const memberMail = get(payload, 'member_mail', '')
    const memberPhone = get(payload, 'member_phone', '')
    debug('memberName: ', memberName)
    debug('memberMail: ', memberMail)
    debug('memberPhone: ', memberPhone)
    const valid = memberName && isEmail(memberMail) && isMobilePhone(memberPhone)
    if (valid) {
      next()
    } else {
      res.status(403).end('Invalid memberName, memberMail or memberPhone')
    }
  } catch (e) {
    console.error(e)
  }
}

// For CORS non-simple requests
router.options('/*', corsMiddle, res => {
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With')
  res.send(200)
})

router.post('/',
  corsMiddle,
  validateObjectType,
  validateDonator,
  (req, res, next) => {
    debug('Got a point reward call!!')
    debug('req.url', req.url)

    const url = `${apiHost}/points`

    const invoiceItem = Object.assign({}, req.body.invoiceItem)
    delete req.body.invoiceItem

    const payload = req.body

    debug('invoiceItem:')
    debug(invoiceItem)

    debug('payload', invoiceItem.lastFourNum)
    debug(payload)

    superagent
    .post(url)
    .send(payload)
    // .timeout(API_TIMEOUT)
    .end((e, r) => {
      if (!e && r) {
        const resData = JSON.parse(r.text)
        const transaction_id = get(resData, 'id')
        res.json(resData)

        /** go next to gen invoice if object_type === POINT_OBJECT_TYPE.DONATE */
        if (get(req, 'body.object_type') !== POINT_OBJECT_TYPE.DONATE || !transaction_id) { return }

        invoiceItem.amtSales = Math.abs(payload.currency || 0)
        invoiceItem.good_name = `Readr Donate: $${invoiceItem.amtSales}(NTD).`
        
        /** Reset req.body and construct invoice date. */
        req.body = Object.assign({}, invoiceItem, {
          items: [
            {
              name: invoiceItem.good_name,
              price: invoiceItem.amtSales,
              count: 1
            }
          ],
          member_name: payload.member_name,
          member_mail: payload.member_mail,
          transaction_id,
        })
        next()
      } else {
        const err_wrapper = handlerError(e, r)
        res.status(err_wrapper.status).json(err_wrapper.text)      
        console.error(`Error occurred when depositing for member ${payload.member_name}/${payload.member_mail}`)
        console.error(e)
      }
    })  
  },
  genInvoice
)

module.exports = router
