


(function() {

    const getFormEntries = () => {
        const formData = new FormData(document.querySelector("#productForm"))
        let pDesc = formData.get('productDesc').trim()
        const pPrice = formData.get('productPrice')

        if (pDesc.length == 0) pDesc = "No description"
        if (isNaN(parseFloat(pPrice))) throw new Error("Product price must be a number")

        return {
            desc: pDesc,
            price: parseFloat(pPrice)
        }
    }

    const getFormEntriesLink = () => {
        const formData = new FormData(document.querySelector("#newFormGroup"))
        let phoneNumber = formData.get('phoneNumber').trim()
        let type = formData.get("type");

        return {
            phoneNumber: phoneNumber,
            type: type
        }
    }

    const hostedCheckoutBtn = document.querySelector('#hostedCheckoutBtn')
    const hostedCheckoutBtnEm = document.querySelector('#hostedCheckoutBtnEm')
    const request2PayBtn = document.querySelector('#request2PayBtn')
    const sendLink = document.querySelector('#sendLink')


    /**
     * Hosted Checkout
     */
    hostedCheckoutBtn.addEventListener('click', (e) => {
        const node = document.getElementById("link-payment")
        node.innerHTML = ""
        e.preventDefault()

        const { price, desc } = getFormEntries()

        const order = new HCOrderRequest(new Date().getTime()+"", "XAF", price + "", desc)
        const interaction = new HCInteractionRequest("AFRILAND-MARCHAND", "https://www.afrilandfirstbank.com")
        const paymentRequest = new HostedCheckoutRequest(order, interaction)
        const paymentSession = new HostedCheckoutPaymentSession(paymentRequest,"test-gateway.mastercard.com","TESTAFB-MARCHANT", "7631e1802ff5c91a2a883d84e13bbd48")

        paymentSession.showPaymentPage(console.log)
        const productDesc = document.getElementById("productDesc")
        const productPrice = document.getElementById("productPrice")

        productDesc.value = ""
        productPrice.value = ""
    })
    
    /**
     * Hosted Checkout Embeded
     */
    hostedCheckoutBtnEm.addEventListener('click', (e) => {
        const node = document.getElementById("link-payment")
        node.innerHTML = ""
        e.preventDefault()

        const { price, desc } = getFormEntries()

        const order = new HCOrderRequest(new Date().getTime()+"", "XAF", price + "", desc)
        const interaction = new HCInteractionRequest("AFRILAND-MARCHAND", "https://www.afrilandfirstbank.com")
        const paymentRequest = new HostedCheckoutRequest(order, interaction)
        const paymentSession = new HostedCheckoutPaymentSession(paymentRequest,"test-gateway.mastercard.com","TESTAFB-MARCHANT", "7631e1802ff5c91a2a883d84e13bbd48")

        paymentSession.showEmbeddedPage("#embed-target",console.log)
        const productDesc = document.getElementById("productDesc")
        const productPrice = document.getElementById("productPrice")

        productDesc.value = ""
        productPrice.value = ""
    })
    


    sendLink.addEventListener('click', (e) => {
        e.preventDefault()
        const { phoneNumber, type} = getFormEntriesLink()
        const link = document.querySelector("#idLink").getAttribute("href")




    })


})()