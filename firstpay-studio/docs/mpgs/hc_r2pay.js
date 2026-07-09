(function() {

    class OrderRequest {
        id = ""
        currency = ""
        amount = ""
        description = ""
            /**
             * 
             * @param {string} id  // Order ID 
             * @param {string} currency // Used currency
             * @param {string} amount // Total amount
             * @param {string} description // Description of the order. It can be the name of the product
             */
        constructor(
            id, currency, amount, description
        ) {
            this.id = id
            this.currency = currency
            this.amount = amount
            this.description = description
        }

        toString() {
            return {
                id: this.id,
                currency: this.currency,
                amount: this.amount,
                description: this.description
            }
        }
    }


    class InteractionRequest {
        returnUrl = ""
        merchantName = ""

        /**
         * 
         * @param {string} merchantName The name of the merchant
         * @param {string} returnUrl When the order will be completed, the url to return information to be checked
         */
        constructor(merchantName, returnUrl) {
            this.merchantName = merchantName
            this.returnUrl = returnUrl
        }

        toString() {
            return {
                operation: "PURCHASE",
                returnUrl: this.returnUrl,
                merchantName: { name: this.merchantName }
            }
        }
    }

    class HostedCheckoutRequest {
        /**
         * @type { OrderRequest }
         */
        orderRequest;
        /**
         * @type { InteractionRequest }
         */
        interactionRequest;

        /**
         * 
         * @param {OrderRequest} orderRequest 
         * @param {InteractionRequest} interactionRequest 
         */
        constructor(
            orderRequest, interactionRequest
        ) {
            this.orderRequest = orderRequest;
            this.interactionRequest = interactionRequest
        }

        toString() {
            return {
                apiOperation: "INITIATE_CHECKOUT",
                order: this.orderRequest.toString(),
                interaction: this.interactionRequest.toString()
            }
        }
    }

    class HostedCheckoutPaymentSession {


        /**
         * @private
         * @type {HostedCheckoutRequest}
         */
        _hostedCheckoutRequest
        /**
         * @private
         * @type {string}
         */
        _token
        /**
         * @private
         * @type {string}
         */
        _merchandId

        /**
         * @private
         * @type {string}
         */
        _host




        /**
         * 
         * @param {HostedCheckoutRequest} hostedCheckoutRequest 
         * @param {string} token 
         * 
         */
        constructor(hostedCheckoutRequest,host,merchandId, token) {
            this._hostedCheckoutRequest = hostedCheckoutRequest
            this._host = host
            this._merchandId = merchandId
            this._token = token
        }

        /**
         * @private
         * @returns {Promise<{successIndicator, session: {id} }>}}
         */
        async _generateSessionId(mode) {

            const hostedValue = this._hostedCheckoutRequest.toString();


            const URL = `https://${this._host}/api/rest/version/llaatteesstt/merchant/${this._merchandId}/session` // Todo: Url must contains the merchant name
            const responseBody = await fetch(URL, {
                method: "POST",
                mode:'cors',
                body: JSON.stringify(
                    {
                        "apiOperation": hostedValue.apiOperation,
                        "checkoutMode": mode,
                        "interaction":{
                            "operation" :hostedValue.interaction.operation,
                             "merchant": { 
                                "name": hostedValue.interaction.merchantName.name,
                                "url":  hostedValue.interaction.returnUrl
                            },
                            // To control the display
                            // "displayControl":{
                            //     "billingAddress":"HIDE", //https://test-gateway.mastercard.com/api/documentation/integrationGuidelines/hostedCheckout/customizingPaymentExperience.html?locale=en_US
                            // },
                            "returnUrl": hostedValue.interaction.returnUrl
                        },
                        "order": {
                            "currency":hostedValue.order.currency,
                            "amount":hostedValue.order.amount,
                            "id" : hostedValue.order.id,
                            "description": hostedValue.order.description
                        }
                     }),
                headers: {
                    "Content-Type" : "application/json",
                    'Authorization': `Basic ${btoa('merchant.'+this._merchandId+':'+this._token)}`,
                    'Accept':"*/*"
                }
            })

            return responseBody.json()

        }
        // interaction.merchant.name
        // interaction.merchant.url

        _executeIfSessionIsActive(callback) {
            if (!this._sessionExpired) {
                callback()
                this._sessionExpired = true
            } else console.error("This session has been already used. Create and use another instance of HostedCheckoutPaymentSession")
        }

        /**
         * 
         * @param {string} selector HTML node id where to show the payment page
         * @param {Function} sessionReqCallback Callback that will be called with the response of the session that has been created. 
         * It will contain the successIndicator key which is usefull to confirm the transaction
         */
        async showEmbeddedPage(selector, sessionReqCallback) {
            this._executeIfSessionIsActive(async() => {
                const mode = "WEBSITE";
                const response = await this._generateSessionId(mode)
                if (sessionReqCallback) sessionReqCallback(response)
                
                Checkout.configure({
                    session: {
                        id: response.session.id
                    }
                });
                Checkout.showEmbeddedPage(selector)
            })
        }

        async showPaymentPage(sessionReqCallback) {
            this._executeIfSessionIsActive(async() => {
                const response = await this._generateSessionId()
                if (sessionReqCallback) sessionReqCallback(response)
                Checkout.configure({
                    session: {
                        id: response.session.id
                    }
                });
                Checkout.showPaymentPage()
            })
        }

    }


    window.HCOrderRequest = OrderRequest
    window.HCInteractionRequest = InteractionRequest
    window.HostedCheckoutRequest = HostedCheckoutRequest
    window.HostedCheckoutPaymentSession = HostedCheckoutPaymentSession



})()